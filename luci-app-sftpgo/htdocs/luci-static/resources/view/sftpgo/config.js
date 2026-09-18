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
	expect: { }
});

const clearAdminCreds = rpc.declare({
	object: 'luci.sftpgo',
	method: 'clear_admin_creds',
	expect: { }
});

async function checkProcess() {
	try {
		const pidofRes = await fs.exec('/bin/pidof', ['sftpgo']);
		if (pidofRes.code === 0) {
			return { running: true, pid: pidofRes.stdout.trim() };
		}
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

function renderStatus(isRunning, httpdPort, version) {
	var statusText = isRunning ? _('RUNNING') : _('NOT RUNNING');
	var color = isRunning ? 'green' : 'red';
	var icon = isRunning ? '\u2713' : '\u2717';
	var versionText = version ? ('v' + version) : '';

	var html = String.format(
		'<em><span style="color:%s">%s <strong>SFTPGo %s - %s</strong></span></em>',
		color, icon, versionText, statusText
	);

	if (isRunning) {
		html += String.format('&#160;<a class="btn cbi-button" href="http://%s:%s/web/admin" target="_blank">%s</a>',
			window.location.hostname, httpdPort, _('Open WebAdmin'));
	}

	return html;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('sftpgo'),
			L.resolveDefault(getAdminCreds(), { exists: false })
		]);
	},

	handleRestartService: async function () {
		try {
			await uci.save('sftpgo');
			await uci.apply();

			await fs.exec('/etc/init.d/sftpgo', ['stop']);
			await new Promise(function (resolve) { setTimeout(resolve, 1000); });
			await fs.exec('/etc/init.d/sftpgo', ['start']);

			alert(_('SUCCESS:') + '\n' + _('SFTPGo service restarted'));
			if (window.sftpgoStatusPoll) window.sftpgoStatusPoll();
		} catch (error) {
			alert(_('ERROR:') + '\n' + error.message);
		}
	},

	handleClearAdminCreds: async function () {
		try {
			await clearAdminCreds();
			var box = document.getElementById('sftpgo_admin_creds_box');
			if (box) box.parentNode.removeChild(box);
		} catch (error) {
			alert(_('ERROR:') + '\n' + error.message);
		}
	},

	render: function (data) {
		var m, s, o;
		var adminCreds = data[1] || {};

		var httpdPort = uci.get('sftpgo', 'config', 'httpd_port') || '8090';

		m = new form.Map('sftpgo', _('SFTPGo'),
			_('SFTPGo is a fully featured SFTP/FTP/WebDAV server with a built-in WebAdmin and WebClient. This page only manages the daemon and its listener ports; user/folder/permission management is done in the WebAdmin itself.'));

		// ---- status bar ------------------------------------------------
		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			var statusView = E('p', { id: 'sftpgo_status' },
				'<span class="spinning"></span> ' + _('Checking status...'));

			window.sftpgoStatusPoll = function () {
				return Promise.all([checkProcess(), getVersionInfo()]).then(function (results) {
					var processInfo = results[0], versionInfo = results[1];
					statusView.innerHTML = renderStatus(processInfo.running, httpdPort, versionInfo.version || '');
				}).catch(function () {
					statusView.innerHTML = '<span style="color:orange">\u26a0 ' + _('Status check error') + '</span>';
				});
			};

			poll.add(window.sftpgoStatusPoll, 5);

			var nodes = [statusView];

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

		// ---- basic ------------------------------------------------------
		s = m.section(form.NamedSection, 'config', 'sftpgo', _('Basic'));

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;

		o = s.option(form.Value, 'delay', _('Delayed start (seconds)'));
		o.datatype = 'uinteger';
		o.default = '10';

		o = s.option(form.Button, '_restart', _('Restart service'));
		o.inputtitle = _('Restart');
		o.inputstyle = 'apply';
		o.onclick = L.bind(this.handleRestartService, this);

		// ---- directories --------------------------------------------------
		s.tab('dirs', _('Directories'));

		o = s.taboption('dirs', form.Value, 'config_dir', _('Config directory'));
		o.default = '/etc/sftpgo';
		o.rmempty = false;

		o = s.taboption('dirs', form.Value, 'data_dir', _('Users base directory'),
			_('Default home directory base for new users: <base>/<username>.'));
		o.default = '/srv/sftpgo/data';
		o.rmempty = false;

		o = s.taboption('dirs', form.Value, 'backups_dir', _('Backups directory'));
		o.default = '/srv/sftpgo/backups';
		o.rmempty = false;

		// ---- protocols ------------------------------------------------
		s.tab('proto', _('Protocol listeners'));

		o = s.taboption('proto', form.Flag, 'sftp_enabled', _('Enable SFTP (SSH)'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('proto', form.Value, 'sftp_port', _('SFTP port'));
		o.datatype = 'port';
		o.default = '2022';
		o.depends('sftp_enabled', '1');

		o = s.taboption('proto', form.Value, 'sftp_address', _('SFTP listen address'));
		o.placeholder = _('all interfaces');
		o.optional = true;
		o.depends('sftp_enabled', '1');

		o = s.taboption('proto', form.Flag, 'ftp_enabled', _('Enable FTP/FTPS'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('proto', form.Value, 'ftp_port', _('FTP port'));
		o.datatype = 'port';
		o.default = '2121';
		o.depends('ftp_enabled', '1');

		o = s.taboption('proto', form.Value, 'ftp_address', _('FTP listen address'));
		o.placeholder = _('all interfaces');
		o.optional = true;
		o.depends('ftp_enabled', '1');

		o = s.taboption('proto', form.Flag, 'webdav_enabled', _('Enable WebDAV'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('proto', form.Value, 'webdav_port', _('WebDAV port'));
		o.datatype = 'port';
		o.default = '2080';
		o.depends('webdav_enabled', '1');

		o = s.taboption('proto', form.Value, 'webdav_address', _('WebDAV listen address'));
		o.placeholder = _('all interfaces');
		o.optional = true;
		o.depends('webdav_enabled', '1');

		o = s.taboption('proto', form.Value, 'httpd_port', _('WebAdmin / WebClient / REST API port'));
		o.datatype = 'port';
		o.default = '8090';
		o.rmempty = false;

		o = s.taboption('proto', form.Value, 'httpd_address', _('WebAdmin listen address'));
		o.placeholder = _('all interfaces');
		o.optional = true;

		// ---- data provider ----------------------------------------------
		s.tab('provider', _('Data provider'));

		o = s.taboption('provider', form.ListValue, 'data_provider', _('Provider'),
			_("sqlite: SFTPGo's own default, mature tooling (inspectable with the sqlite3 CLI). bolt: pure Go embedded KV store, no external tooling. memory: nothing is persisted, for testing only."));
		o.value('sqlite', _('sqlite (default)'));
		o.value('bolt', _('bolt (embedded)'));
		o.value('memory', _('memory (volatile)'));
		o.default = 'sqlite';

		o = s.taboption('provider', form.Value, 'db_name', _('Database file name'),
			_('Leave empty to auto-derive a name from the provider (bolt: sftpgo.bolt, sqlite: sftpgo.sqlite3). Do not reuse the same file name between bolt and sqlite, their file formats are incompatible.'));
		o.placeholder = _('auto');
		o.optional = true;
		o.depends('data_provider', 'bolt');
		o.depends('data_provider', 'sqlite');

		o = s.taboption('provider', form.Flag, 'create_default_admin', _('Auto-create the first administrator'),
			_('Only takes effect while no administrator account exists yet. The generated credentials are shown above once.'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('provider', form.Value, 'default_admin_user', _('Administrator username'));
		o.default = 'admin';
		o.depends('create_default_admin', '1');

		o = s.taboption('provider', form.Value, 'default_admin_password', _('Administrator password'),
			_('Leave empty to auto-generate a random password on first start.'));
		o.password = true;
		o.optional = true;
		o.depends('create_default_admin', '1');

		// ---- logging ------------------------------------------------------
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
	}
});
