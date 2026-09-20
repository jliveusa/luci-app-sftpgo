'use strict';
'require view';
'require fs';
'require rpc';

const getNativeConfig = rpc.declare({
	object: 'luci.sftpgo',
	method: 'get_native_config',
	expect: {}
});

const validateNativeConfig = rpc.declare({
	object: 'luci.sftpgo',
	method: 'validate_native_config',
	params: [ 'content' ],
	expect: {}
});

const saveNativeConfig = rpc.declare({
	object: 'luci.sftpgo',
	method: 'save_native_config',
	params: [ 'content' ],
	expect: {}
});

const restoreNativeConfig = rpc.declare({
	object: 'luci.sftpgo',
	method: 'restore_native_config',
	params: [ 'slot' ],
	expect: {}
});

const resetNativeConfig = rpc.declare({
	object: 'luci.sftpgo',
	method: 'reset_native_config',
	expect: {}
});

function notify(message, type) {
	var box = document.getElementById('sftpgo_native_status');
	if (!box)
		return;

	box.className = 'alert-message ' + (type === 'error' ? 'error' : (type === 'success' ? 'success' : 'notice'));
	box.textContent = message;
}

function downloadText(content) {
	var blob = new Blob([content], { type: 'application/json;charset=utf-8' });
	var url = URL.createObjectURL(blob);
	var a = E('a', { href: url, download: 'sftpgo.json' });
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

return view.extend({
	load: function () {
		return getNativeConfig();
	},

	render: function (info) {
		var self = this;
		info = info || {};
		var editor;
		var pathLabel;
		var fileInput;

		function currentContent() {
			return editor ? editor.value : '';
		}

		function setEditor(content) {
			if (editor)
				editor.value = content || '';
		}

		function validate() {
			return validateNativeConfig(currentContent()).then(function (res) {
				if (res && res.valid) {
					notify(_('JSON syntax is valid. The file can be saved.'), 'success');
					return true;
				}

				notify(_('JSON validation failed: ') + ((res && res.error) || JSON.stringify(res || {})), 'error');
				return false;
			}).catch(function (err) {
				notify(_('JSON validation failed: ') + (err.message || err), 'error');
				return false;
			});
		}

		function save(restart) {
			return saveNativeConfig(currentContent()).then(function (res) {
				if (!res || !res.ok) {
					notify(_('Save failed: ') + ((res && res.error) || JSON.stringify(res || {})), 'error');
					return false;
				}

				if (!restart) {
					notify(_('Configuration saved. Restart SFTPGo to apply it.'), 'success');
					return true;
				}

				return fs.exec('/etc/init.d/sftpgo', ['restart']).then(function (restartRes) {
					if (restartRes.code !== 0) {
						notify(_('Configuration was saved, but SFTPGo failed to restart. Check the log.'), 'error');
						return false;
					}

					notify(_('Configuration saved and SFTPGo restarted successfully.'), 'success');
					return true;
				}).catch(function (err) {
					notify(_('Configuration was saved, but restart failed: ') + (err.message || err), 'error');
					return false;
				});
			});
		}

		function reload() {
			return getNativeConfig().then(function (res) {
				info = res || {};
				setEditor(info.content || '');
				pathLabel.textContent = _('Configuration file: ') + (info.path || '/etc/sftpgo/sftpgo.json');
				notify(_('Configuration reloaded from disk.'), 'notice');
			});
		}

		function restore(slot) {
			return restoreNativeConfig(slot).then(function (res) {
				if (!res || !res.ok) {
					notify(_('Restore failed: ') + ((res && res.error) || _('Backup does not exist')), 'error');
					return;
				}
				return reload();
			}).catch(function (err) {
				notify(_('Restore failed: ') + (err.message || err), 'error');
			});
		}

		function resetDefault() {
			if (!confirm(_('Reset sftpgo.json to the packaged SFTPGo default? The current configuration will be backed up first.')))
				return;

			return resetNativeConfig().then(function (res) {
				if (!res || !res.ok) {
					notify(_('Reset failed: ') + ((res && res.error) || JSON.stringify(res || {})), 'error');
					return;
				}
				return reload();
			}).catch(function (err) {
				notify(_('Reset failed: ') + (err.message || err), 'error');
			});
		}

		function importFile(file) {
			if (!file)
				return;

			var reader = new FileReader();
			reader.onload = function (ev) {
				setEditor(ev.target.result || '');
				notify(_('Imported file into the editor. Validate before saving.'), 'notice');
			};
			reader.onerror = function () {
				notify(_('Failed to read the selected file.'), 'error');
			};
			reader.readAsText(file);
		}

		pathLabel = E('p', { style: 'margin-bottom:0.5em; font-weight:600;' },
			_('Configuration file: ') + (info.path || '/etc/sftpgo/sftpgo.json'));

		var helper = E('div', { class: 'alert-message notice' }, [
			E('p', {}, _('This is the native SFTPGo configuration file. All fields documented by SFTPGo remain available here, including TLS certificates, SSH host keys, ACME, OIDC, MFA, KMS, SMTP, database providers, protocol bindings, security policies and Plugins.')),
			E('p', {}, _('Save operations keep up to three rolling backups: sftpgo.json.bak, .bak.1 and .bak.2. The current file is replaced atomically after JSON validation.'))
		]);

		var buttons = [
			E('button', { class: 'cbi-button cbi-button-apply', click: function () { validate(); } }, _('Validate JSON')),
			E('button', { class: 'cbi-button cbi-button-save', click: function () { save(false); } }, _('Save')),
			E('button', { class: 'cbi-button cbi-button-apply', click: function () { save(true); } }, _('Save & Restart')),
			E('button', { class: 'cbi-button', click: function () { reload(); } }, _('Reload')),
			E('button', { class: 'cbi-button', click: function () { downloadText(currentContent()); } }, _('Download JSON')),
			E('button', { class: 'cbi-button', click: function () { fileInput.click(); } }, _('Import JSON')),
			E('button', { class: 'cbi-button cbi-button-remove', click: function () { resetDefault(); } }, _('Reset to SFTPGo Default'))
		];

		fileInput = E('input', {
			type: 'file',
			accept: '.json,application/json,text/plain',
			style: 'display:none;'
		});
		fileInput.addEventListener('change', function () {
			importFile(this.files && this.files[0]);
			this.value = '';
		});

		var restoreBox = E('div', { class: 'cbi-section' }, [
			E('h3', {}, _('Restore backup')),
			E('button', { class: 'cbi-button', click: function () { restore('bak'); } }, _('Restore .bak')),
			E('button', { class: 'cbi-button', click: function () { restore('bak1'); } }, _('Restore .bak.1')),
			E('button', { class: 'cbi-button', click: function () { restore('bak2'); } }, _('Restore .bak.2'))
		]);

		editor = E('textarea', {
			class: 'cbi-input-textarea',
			spellcheck: false,
			wrap: 'off',
			style: 'width:100%; min-height:65vh; font-family:monospace; font-size:13px; line-height:1.45;'
		}, info.content || '');

		return E('div', { class: 'cbi-map' }, [
			E('div', { class: 'cbi-section' }, [
				E('h2', {}, _('Native SFTPGo Configuration')),
				pathLabel,
				helper,
				E('div', { id: 'sftpgo_native_status', class: 'alert-message notice', style: 'display:block;' },
					info.valid ? _('Configuration loaded successfully.') : (_('Current JSON is invalid: ') + (info.error || JSON.stringify(info || {})))),
				E('div', { style: 'margin-bottom:0.75em;' }, buttons),
				fileInput,
				editor
			]),
			restoreBox
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
