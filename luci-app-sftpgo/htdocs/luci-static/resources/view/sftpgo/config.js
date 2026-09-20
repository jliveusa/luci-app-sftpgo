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

const getConfigSummary = rpc.declare({
	object: 'luci.sftpgo',
	method: 'get_config_summary',
	expect: {}
});

async function checkProcess() {
	try {
		const res = await fs.exec('/bin/pidof', ['sftpgo']);
		return { running: res.code === 0, pid: res.stdout.trim() };
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

	// sftpgo.json 现在是唯一权威来源，SFTP/FTP/WebDAV 全部为 0 只可能是
	// JSON 里确实这么写的——直接在状态栏提示，而不是让用户自己去猜为什么
	// 协议连不上，省得重演“端口明明配了但连不上”的排查过程。
	if (summary && summary.valid && summary.no_protocol_enabled) {
		html += '<br><span style="color:orange">\u26a0 ' +
			_('SFTP, FTP and WebDAV are all disabled (port 0) in sftpgo.json. Only the WebAdmin/REST API is reachable. Edit the bindings on the Native Configuration page to enable a transfer protocol.') +
			'</span>';
	}

	return html;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('sftpgo'),
			L.resolveDefault(getConfigSummary(), { valid: false })
		]);
	},

	handleRestartService: async function () {
		try {
			if (this.map)
				await this.map.save();
			else
				await uci.save('sftpgo');

			// uci/apply returns UBUS_STATUS_NO_DATA when there are no pending UCI changes.
			// Only apply when this page actually staged changes to /etc/config/sftpgo.
			const changes = await uci.changes();
			const pending = changes && changes.sftpgo;
			if (pending && pending.length > 0)
				await uci.apply();

			await restartService();
			alert(_('SUCCESS:') + '\n' + _('SFTPGo service restarted'));
			if (window.sftpgoStatusPoll)
				window.sftpgoStatusPoll();
		} catch (error) {
			alert(_('ERROR:') + '\n' + (error.message || error));
		}
	},

	render: function (data) {
		var m, s, o;
		var summary = data[1] || {};

		m = new form.Map('sftpgo', _('SFTPGo'),
			_('OpenWrt 只管理 SFTPGo 服务启停和启动延时。SFTP、FTP/FTPS、WebDAV、HTTPS、证书、数据库、OIDC、MFA、ACME、Plugins 等完整 SFTPGo 配置统一保存在原生 sftpgo.json 中。'));
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
				nodes.push(E('div', { style: 'margin-top:0.5em;' }, [
					E('a', { class: 'btn cbi-button', href: L.url('admin/services/sftpgo/native') },
						_('Open Native Configuration (sftpgo.json)'))
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

		o = s.option(form.DummyValue, '_config_path', _('Configuration file'));
		o.readonly = true;
		o.cfgvalue = function () { return '/etc/sftpgo/sftpgo.json'; };
		o.description = _('SFTPGo uses this native JSON file as its only runtime configuration.');

		o = s.option(form.Button, '_restart', _('Restart service'));
		o.inputtitle = _('Restart');
		o.inputstyle = 'apply';
		o.onclick = L.bind(this.handleRestartService, this);

		return m.render();
	},

	handleSaveApply: function (ev, mode) {
		return this.handleRestartService();
	}
});
