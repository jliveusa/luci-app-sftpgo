'use strict';
'require dom';
'require fs';
'require poll';
'require view';

return view.extend({
	render: function () {
		var css = `
			.log-container { max-height:1200px; overflow-y:auto; border-radius:3px; margin-top:10px; padding:5px; background-color:var(--background-color); font-family:monospace; font-size:12px; border:1px solid var(--border-color); }
			.log-line { padding:3px 5px; font-family:monospace; font-size:12px; line-height:1.4; border-bottom:1px solid var(--border-color-light); white-space:pre-wrap; word-break:break-all; }
			.log-line:last-child { border-bottom:none; }
			.log-error { color:#cc0000; }
			.log-warning { color:#ff9900; }
		`;

		var logContainer = E('div', { class:'log-container', id:'log_container', style:'min-height:200px;' },
			E('div', { class:'log-line' }, _('Loading logs...')));
		var lastLogContent = '';

		function formatLogContent(content) {
			if (!content || content.trim() === '')
				return E('div', { class:'log-line' }, _('No sftpgo logs found.'));

			var nodes = [];
			content.split('\n').forEach(function (line) {
				line = line.trim();
				if (!line) return;
				var cls = 'log-line';
				if (/err|ERROR|failed/.test(line)) cls += ' log-error';
				else if (/warn|WARNING/.test(line)) cls += ' log-warning';
				nodes.push(E('div', { class:cls }, line));
			});
			return nodes.length ? E('div', {}, nodes) : E('div', { class:'log-line' }, _('No sftpgo logs found.'));
		}

		function fetchLogs() {
			return fs.exec('/sbin/logread', ['-l', '300']).then(function (res) {
				var content = (res && res.stdout) || '';
				content = content.split('\n').filter(function (line) { return /sftpgo/i.test(line); }).join('\n').trim();
				if (content === lastLogContent) return;
				lastLogContent = content;
				dom.content(logContainer, formatLogContent(content));
			}).catch(function (err) {
				dom.content(logContainer, E('div', { class:'log-line log-error' },
					_('Failed to read logs: %s').format(err.message || 'Resource not found')));
			});
		}

		setTimeout(fetchLogs, 100);
		poll.add(fetchLogs);
		poll.start();

		return E('div', { class:'cbi-map' }, [
			E('style', [css]),
			E('div', { class:'cbi-section' }, [
				E('h2', {}, _('SFTPGo Log')),
				E('small', {}, _('Read-only view of the OpenWrt system log.')),
				logContainer
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
