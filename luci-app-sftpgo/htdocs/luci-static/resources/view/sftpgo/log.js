// SPDX-License-Identifier: Apache-2.0
'use strict';
'require dom';
'require fs';
'require poll';
'require view';

return view.extend({
	render: function () {
		var css = `
			.log-container {
				max-height: 1200px;
				overflow-y: auto;
				border-radius: 3px;
				margin-top: 10px;
				padding: 5px;
				background-color: var(--background-color);
				font-family: monospace;
				font-size: 12px;
				border: 1px solid var(--border-color);
			}
			.log-line {
				padding: 3px 5px;
				font-family: monospace;
				font-size: 12px;
				line-height: 1.4;
				border-bottom: 1px solid var(--border-color-light);
				white-space: pre-wrap;
				word-break: break-all;
			}
			.log-line:last-child {
				border-bottom: none;
			}
			.log-error {
				color: #cc0000;
			}
			.log-warning {
				color: #ff9900;
			}
			.control-buttons {
				margin-bottom: 10px;
				display: flex;
				gap: 5px;
			}
		`;

		var log_container = E('div', {
			'class': 'log-container',
			'id': 'log_container',
			'style': 'min-height: 200px;'
		}, E('div', { 'class': 'log-line' }, _('Loading logs...')));

		var lastLogContent = '';
		var isScrolledToTop = true;

		function formatLogLine(line) {
			if (!line || line.trim() === '') return null;

			var lineClass = ['log-line'];
			if (/err|ERROR|failed/.test(line)) {
				lineClass.push('log-error');
			} else if (/warn|WARNING/.test(line)) {
				lineClass.push('log-warning');
			}

			return E('div', { 'class': lineClass.join(' ') }, line);
		}

		function formatLogContent(logContent) {
			if (!logContent || logContent.trim() === '') {
				return E('div', { 'class': 'log-line' }, _('No sftpgo logs found.'));
			}

			var lines = logContent.split('\n');
			var formattedLines = [];

			for (var i = 0; i < lines.length; i++) {
				var line = lines[i].trim();
				if (line === '' || line.includes('No sftpgo logs found')) continue;

				var formattedLine = formatLogLine(line);
				if (formattedLine) formattedLines.push(formattedLine);
			}

			if (formattedLines.length === 0) {
				return E('div', { 'class': 'log-line' }, _('No sftpgo logs found.'));
			}

			return E('div', {}, formattedLines);
		}

		function clearLogs(button) {
			button.disabled = true;
			button.textContent = _('Clearing...');

			return fs.exec('/usr/libexec/sftpgo-call', ['clear_logs'])
				.then(function () {
					button.textContent = _('Logs cleared!');
					lastLogContent = '';
					return fetchLogs();
				})
				.catch(function (err) {
					console.error('Clear logs error:', err);
					button.textContent = _('Failed to clear');
				})
				.finally(function () {
					setTimeout(function () {
						button.disabled = false;
						button.textContent = _('Clear Logs');
					}, 2000);
				});
		}

		function fetchLogs() {
			return fs.exec('/usr/libexec/sftpgo-call', ['get_logs'])
				.then(function (res) {
					var logContent = (res && res.stdout !== undefined) ? res.stdout : '';
					logContent = logContent.trim();

					if (logContent !== lastLogContent) {
						var formattedLog = formatLogContent(logContent);
						var prevScrollHeight = log_container.scrollHeight;
						var prevScrollTop = log_container.scrollTop;

						dom.content(log_container, formattedLog);
						lastLogContent = logContent;

						if (!isScrolledToTop) {
							var newScrollHeight = log_container.scrollHeight;
							log_container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
						}
					}

					return Promise.resolve();
				})
				.catch(function (err) {
					console.error('Log fetch error:', err);
					var errorMsg = _('Failed to read logs: %s').format(err.message || 'Resource not found');
					dom.content(log_container, E('div', { 'class': 'log-line log-error' }, errorMsg));
					return Promise.reject(err);
				});
		}

		var clear_button = E('button', {
			'class': 'cbi-button cbi-button-remove',
			'click': function (ev) {
				ev.preventDefault();
				clearLogs(ev.target);
			}
		}, _('Clear Logs'));

		log_container.addEventListener('scroll', function () {
			isScrolledToTop = this.scrollTop <= 1;
		});

		setTimeout(fetchLogs, 200);

		poll.add(function () {
			return fetchLogs().catch(function (err) {
				console.error('Poll error:', err);
			});
		});

		poll.start();

		return E('div', { 'class': 'cbi-map' }, [
			E('style', [css]),
			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'class': 'control-buttons' }, [clear_button]),
				log_container,
				E('small', {}, [_('Refresh every 5 seconds.')])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
