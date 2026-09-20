'use strict';
'require view';
'require fs';
'require uci';
'require poll';
'require rpc';

const getConfigSummary = rpc.declare({
	object: 'luci.sftpgo',
	method: 'get_config_summary',
	expect: {}
});

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('sftpgo'),
			L.resolveDefault(getConfigSummary(), { valid: false })
		]);
	},

	checkRunning: function () {
		return fs.exec('/bin/pidof', ['sftpgo']).then(function (res) {
			return { isRunning: res.code === 0 };
		}).catch(function () {
			return { isRunning: false };
		});
	},

	render: function (data) {
		var self = this;
		var summary = data[1] || {};

		return this.checkRunning().then(function (checkResult) {
			var isRunning = checkResult.isRunning;
			var enabled = uci.get('sftpgo', 'config', 'enabled') === '1';
			var container = E('div');

			if (!isRunning || !enabled) {
				var message = !enabled
					? _('SFTPGo is disabled. Enable it on the Service Settings page.')
					: _('SFTPGo Service Not Running');

				container.appendChild(E('div', {
					style: 'text-align: center; padding: 2em;'
				}, [
					E('h2', {}, 'SFTPGo'),
					E('p', {}, message)
				]));
			} else {
				var note;
				var children = [ E('h2', {}, _('SFTPGo WebAdmin')) ];

				if (summary.valid) {
					var scheme = summary.httpd_https ? 'https' : 'http';
					var port = summary.httpd_port || 8080;
					var target = scheme + '://' + window.location.hostname + ':' + port + '/web/admin';
					note = _('WebAdmin: ') + target;
					children.push(E('p', {}, note));
					children.push(E('a', {
						href: target,
						target: '_blank',
						class: 'cbi-button cbi-button-apply',
						style: 'display: inline-block; margin-top: 1em; padding: 10px 20px; font-size: 16px; text-decoration: none;'
					}, _('Open WebAdmin')));

					if (summary.no_protocol_enabled) {
						children.push(E('p', { style: 'color:orange; margin-top: 1em;' },
							_('SFTP, FTP and WebDAV are all disabled (port 0) in sftpgo.json. Edit the bindings on the Native Configuration page to enable a transfer protocol.')));
					}
				} else {
					children.push(E('p', {}, _('The native sftpgo.json could not be parsed. Open the Native Configuration page to fix it.')));
				}

				container.appendChild(E('div', {
					style: 'text-align: center; padding: 2em;'
				}, children));
			}

			poll.add(function () {
				return Promise.all([self.checkRunning(), getConfigSummary()]).then(function (results) {
					var currentRunning = results[0].isRunning;
					var currentSummary = results[1] || {};
					if (currentRunning !== isRunning || currentSummary.httpd_port !== summary.httpd_port || currentSummary.httpd_https !== summary.httpd_https)
						window.location.reload();
				});
			}, 5);

			poll.start();
			return container;
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
