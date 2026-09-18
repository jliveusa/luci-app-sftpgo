'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require form';
'require poll';
'require rpc';

const getSftpgoVersion = rpc.declare({
	object: 'luci.sftpgo',
	method: 'get_ver',
	expect: { 'ver': {} }
});

const getAdminCreds = rpc.declare({
	object: 'luci.sftpgo',
	method: 'get_admin_creds',
	expect: {}
});

const clearAdminCreds = rpc.declare({
	object: 'luci.sftpgo',
	method: 'clear_admin_creds',
	expect: {}
});

const getConfigSummary = rpc.declare({
	object: 'luci.sftpgo',
	method: 'get_config_summary',
	expect: {}
});

async function checkProcess() {
	try {
		const pidofRes = await fs.exec('/bin/pidof', ['sftpgo']);
		if (pidofRes.code === 0)
			return { running: true, pid: pidofRes.stdout.trim() };
	} catch (err) { }

	try {
		const psRes = await fs.exec('/bin/ash', ['-c', "ps | grep '[s]ftpgo serve'"]);
		return { running: psRes.code === 0, pid: null };
	} catch (err) {
		return { running: false, pid: null };
	}
}

function getVersionInfo() {
	return L.resolveDefault(getSftpgoVersion(), {}).then(function (result) {
		return result || {};
	}).catch(function () {
		return {};
	});
}

function restartService() {
	return fs.exec('/etc/init.d/sftpgo', ['restart']);
}

function renderStatus(isRunning, summary, version) {
	var statusText = isRunning ? _('RUNNING') : _('NOT RUNNING');
	var icon = isRunning ? '\u2713' : '\u2717';
	var versionText = version ? ('v' + version) : '';
	var html = String.format(
		'<em><span style="color:%s">%s <strong>SFTPGo %s - %s</strong></span></em>',
		isRunning ? 'green' : 'red', icon, versionText, statusText
	);

	if (isRunning && summary && summary.valid && summary.httpd_port > 0) {
		var scheme = summary.httpd_https ? 'https' : 'http';
		var target = scheme + '://' + window.location.hostname + ':' + summary.httpd_port + '/web/admin';
		html += String.format(
			'&#160;<a class="btn cbi-button" href="%s" target="_blank">%s</a>',
			target, _('Open WebAdmin')
		);
	}

	return html;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('sftpgo'),
			L.resolveDefault(getAdminCreds(), { exists: false }),
			L.resolveDefault(getConfigSummary(), { valid: false })
		]);
	},

	handleRestartService: async function () {
		try {
			if (this.map)
				await this.map.save();
			else
				await uci.save('sftpgo');

			await uci.apply();
			await restartService();
			alert(_('SUCCESS:') + '\n' + _('SFTPGo service restarted'));
			if (window.sftpgoStatusPoll)
				window.sftpgoStatusPoll();
		} catch (error) {
			alert(_('ERROR:') + '\n' + (error.message || error));
		}
	},

	handleClearAdminCreds: async function () {
		try {
			await clearAdminCreds();
			var box = document.getElementById('sftpgo_admin_creds_box');
			if (box)
				box.parentNode.removeChild(box);
		} catch (error) {
			alert(_('ERROR:') + '\n' + (error.message || error));
		}
	},

	render: function (data) {
		var m, s, o;
		var adminCreds = data[1] || {};
		var summary = data[2] || {};

		m = new form.Map('sftpgo', _('SFTPGo'),
			_('OpenWrt 只管理 SFTPGo 服务本身、日志和首次管理员引导。SFTP、FTP/FTPS、WebDAV、HTTPS、证书、数据库、OIDC、MFA、ACME、Plugins 等完整 SFTPGo 配置统一保存在原生 sftpgo.json 中。'));
		this.map = m;

		// ---- status ---------------------------------------------------------
		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			var statusView = E('p', { id: 'sftpgo_status' },
				'<span class="spinning"></span> ' + _('Checking status...'));

			window.sftpgoStatusPoll = function () {
				return Promise.all([checkProcess(), getVersionInfo(), getConfigSummary()]).then(function (results) {
					var processInfo = results[0];
					var versionInfo = results[1];
					var configInfo = results[2] || {};
					statusView.innerHTML = renderStatus(processInfo.running, configInfo, versionInfo.version || '');
				}).catch(function () {
					statusView.innerHTML = '<span style="color:orange">\u26a0 ' + _('Status check error') + '</span>';
				});
			};

			poll.add(window.sftpgoStatusPoll, 5);

			var nodes = [statusView];

			if (summary.path) {
				nodes.push(E('small', { style: 'display:block; margin-top:0.5em; opacity:0.8;' },
					_('Native configuration: ') + summary.path));
			}

			if (adminCreds.exists) {
				nodes.push(E('div', {
					id: 'sftpgo_admin_creds_box',
					class: 'alert-message warning',
					style: 'margin-top: 1em;'
				}, [
					E('p', {}, _('An administrator account was created automatically on first start. Please log in and change the password, then dismiss this notice:')),
					E('p', {}, [
						E('strong', {}, _('Username: ')), adminCreds.username, E('br'),
						E('strong', {}, _('Password: ')), adminCreds.password
					]),
					E('button', {
						class: 'btn cbi-button cbi-button-positive',
						click: ui.createHandlerFn(this, 'handleClearAdminCreds')
					}, _('I have saved it, dismiss'))
				]));
			}

			return E('div', { class: 'cbi-section', id: 'status_bar' }, nodes);
		};

		// ---- service --------------------------------------------------------
		s = m.section(form.NamedSection, 'config', 'sftpgo', _('Service'));

		o = s.option(form.Flag, 'enabled', _('Enable'),
			_('Enable the SFTPGo daemon. Protocols and listener ports are configured in the native JSON page.'));
		o.rmempty = false;

		o = s.option(form.Value, 'delay', _('Delayed start (seconds)'));
		o.datatype = 'uinteger';
		o.default = '10';

		o = s.option(form.DummyValue, '_config_dir', _('Configuration directory'));
		o.readonly = true;
		o.cfgvalue = function (section_id) {
			return uci.get('sftpgo', section_id, 'config_dir') || '/etc/sftpgo';
		};
		o.description = _('The native SFTPGo configuration file is sftpgo.json inside this directory. The directory is kept in UCI for compatibility; edit the JSON rather than creating parallel UCI listener settings.');

		o = s.option(form.Button, '_restart', _('Restart service'));
		o.inputtitle = _('Restart');
		o.inputstyle = 'apply';
		o.onclick = L.bind(this.handleRestartService, this);

		// ---- bootstrap admin -----------------------------------------------
		s.tab('admin', _('First administrator'));

		o = s.taboption('admin', form.Flag, 'create_default_admin', _('Auto-create the first administrator'),
			_('This is an OpenWrt bootstrap helper. It takes effect only while no administrator exists; all normal SFTPGo configuration stays in sftpgo.json.'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('admin', form.Value, 'default_admin_user', _('Administrator username'));
		o.default = 'admin';
		o.depends('create_default_admin', '1');

		o = s.taboption('admin', form.Value, 'default_admin_password', _('Administrator password'),
			_('Leave empty to generate a random password on first start.'));
		o.password = true;
		o.optional = true;
		o.depends('create_default_admin', '1');

		// ---- logging --------------------------------------------------------
		s.tab('log', _('Logging'));

		o = s.taboption('log', form.ListValue, 'log_level', _('Log level'));
		o.value('debug', 'debug');
		o.value('info', 'info');
		o.value('warn', 'warn');
		o.value('error', 'error');
		o.default = 'info';

		o = s.taboption('log', form.Value, 'log_file', _('Log file path'));
		o.default = '/var/log/sftpgo/sftpgo.log';
		o.rmempty = false;

		o = s.taboption('log', form.Value, 'log_max_size', _('Log rotation size (MB)'));
		o.datatype = 'uinteger';
		o.default = '10';

		o = s.taboption('log', form.Value, 'log_max_backups', _('Max old log files kept'));
		o.datatype = 'uinteger';
		o.default = '3';

		o = s.taboption('log', form.Value, 'log_max_age', _('Max log age (days)'));
		o.datatype = 'uinteger';
		o.default = '28';

		o = s.taboption('log', form.Flag, 'log_compress', _('Compress rotated logs'));
		o.default = '1';
		o.rmempty = false;

		return m.render();
	},

	handleSaveApply: function (ev, mode) {
		return this.handleRestartService();
	}
});
