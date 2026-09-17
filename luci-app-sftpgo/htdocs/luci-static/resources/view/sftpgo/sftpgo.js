'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require poll';

return view.extend({
	load: function () {
		return uci.load('sftpgo');
	},

	checkRunning: function () {
		return fs.exec('/bin/pidof', ['sftpgo']).then(function (pidRes) {
			if (pidRes.code === 0) return { isRunning: true };
			return fs.exec('/bin/ash', ['-c', 'ps | grep -q "[s]ftpgo serve"']).then(function (grepRes) {
				return { isRunning: grepRes.code === 0 };
			});
		});
	},

	render: function () {
		var self = this;

		return this.checkRunning().then(function (checkResult) {
			var isRunning = checkResult.isRunning;
			var enabled = uci.get('sftpgo', 'config', 'enabled') === '1';
			var httpdPort = uci.get('sftpgo', 'config', 'httpd_port') || '8090';

			var container = E('div');

			if (!isRunning || !enabled) {
				var message = !enabled
					? _('SFTPGo is disabled. Enable it on the Base Setting page.')
					: _('SFTPGo Service Not Running');

				container.appendChild(E('div', {
					style: 'text-align: center; padding: 2em;'
				}, [
					E('h2', {}, 'SFTPGo'),
					E('p', {}, message)
				]));
			} else {
				var isHttps = window.location.protocol === 'https:';
				var target = 'http://' + window.location.hostname + ':' + httpdPort + '/web/admin';

				if (isHttps) {
					container.appendChild(E('div', {
						style: 'text-align: center; padding: 2em;'
					}, [
						E('h2', {}, _('SFTPGo WebAdmin')),
						E('p', {}, _('Due to browser security policies, the plain-HTTP SFTPGo interface cannot be embedded from an HTTPS LuCI session.')),
						E('a', {
							href: target,
							target: '_blank',
							class: 'cbi-button cbi-button-apply',
							style: 'display: inline-block; margin-top: 1em; padding: 10px 20px; font-size: 16px; text-decoration: none; color: white;'
						}, _('Open WebAdmin'))
					]));
				} else {
					var iframe = E('iframe', {
						src: target,
						style: 'width: 100%; min-height: 100vh; border: none;'
					});
					container.appendChild(iframe);
				}
			}

			poll.add(function () {
				return self.checkRunning().then(function (checkResult) {
					if (checkResult.isRunning !== isRunning) {
						window.location.reload();
					}
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
