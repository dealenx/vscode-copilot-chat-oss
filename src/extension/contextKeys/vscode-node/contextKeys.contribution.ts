/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, extensions, window } from 'vscode';
import { IAuthenticationService, MinimalModeError } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun } from '../../../util/vs/base/common/observableInternal';
import { GHPR_EXTENSION_ID } from '../../chatSessions/vscode/chatSessionsUriHandler';

const welcomeViewContextKeys = {
	Activated: 'github.copilot-chat.activated',
	Offline: 'github.copilot.offline',
	IndividualDisabled: 'github.copilot.interactiveSession.individual.disabled',
	IndividualExpired: 'github.copilot.interactiveSession.individual.expired',
	ContactSupport: 'github.copilot.interactiveSession.contactSupport',
	EnterpriseDisabled: 'github.copilot.interactiveSession.enterprise.disabled',
	InvalidToken: 'github.copilot.interactiveSession.invalidToken',
	RateLimited: 'github.copilot.interactiveSession.rateLimited',
	GitHubLoginFailed: 'github.copilot.interactiveSession.gitHubLoginFailed',
};

const chatQuotaExceededContextKey = 'github.copilot.chat.quotaExceeded';

const showLogViewContextKey = `github.copilot.chat.showLogView`;
const debugReportFeedbackContextKey = 'github.copilot.debugReportFeedback';

const previewFeaturesDisabledContextKey = 'github.copilot.previewFeaturesDisabled';

const debugContextKey = 'github.copilot.chat.debug';

const missingPermissiveSessionContextKey = 'github.copilot.auth.missingPermissiveSession';

export const prExtensionInstalledContextKey = 'github.copilot.prExtensionInstalled';

export class ContextKeysContribution extends Disposable {

	private _showLogView = false;

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IEnvService private readonly _envService: IEnvService
	) {
		super();

		void this._inspectContext().catch(console.error);
		void this._updatePermissiveSessionContext().catch(console.error);
		this._register(_authenticationService.onDidAuthenticationChange(async () => await this._onAuthenticationChange()));
		this._register(commands.registerCommand('github.copilot.refreshToken', async () => await this._inspectContext()));
		this._register(commands.registerCommand('github.copilot.debug.showChatLogView', async () => {
			this._showLogView = true;
			await commands.executeCommand('setContext', showLogViewContextKey, true);
			await commands.executeCommand('copilot-chat.focus');
		}));
		this._register(window.onDidChangeWindowState(() => this._runOfflineCheck('Window state change')));

		this._updateShowLogViewContext();
		this._updateDebugContext();
		this._updatePrExtensionInstalledContext();

		const debugReportFeedback = this._configService.getConfigObservable(ConfigKey.TeamInternal.DebugReportFeedback);
		this._register(autorun(reader => {
			commands.executeCommand('setContext', debugReportFeedbackContextKey, debugReportFeedback.read(reader));
		}));

		// Listen for extension changes to update PR extension installed context
		this._register(extensions.onDidChange(() => {
			this._updatePrExtensionInstalledContext();
		}));
	}

	private _runOfflineCheck(trigger: string) {
		this._logService.debug(`[context keys] ${trigger}. Running offline check.`);
		this._inspectContext()
			.catch(err => this._logService.error(err));
	}

	private async _inspectContext() {
		this._logService.debug(`[context keys] Updating context keys (no-auth mode: always activated).`);

		commands.executeCommand('setContext', welcomeViewContextKeys.Activated, true);
		for (const contextKey of Object.values(welcomeViewContextKeys)) {
			if (contextKey !== welcomeViewContextKeys.Activated) {
				commands.executeCommand('setContext', contextKey, false);
			}
		}

		await this._updatePermissiveSessionContext();
	}

	private async _updateQuotaExceededContext() {
		try {
			const copilotToken = await this._authenticationService.getCopilotToken();
			commands.executeCommand('setContext', chatQuotaExceededContextKey, copilotToken.isChatQuotaExceeded);
		} catch (e) {
			commands.executeCommand('setContext', chatQuotaExceededContextKey, false);
		}
	}

	private async _updatePreviewFeaturesDisabledContext() {
		try {
			const copilotToken = await this._authenticationService.getCopilotToken();
			const disabled = !copilotToken.isEditorPreviewFeaturesEnabled();
			if (disabled) {
				this._logService.warn(`Copilot preview features are disabled by organizational policy. Learn more: https://aka.ms/github-copilot-org-enable-features`);
			}
			commands.executeCommand('setContext', previewFeaturesDisabledContextKey, disabled);
		} catch (e) {
			commands.executeCommand('setContext', previewFeaturesDisabledContextKey, undefined);
		}
	}

	private _updateShowLogViewContext() {
		if (this._showLogView) {
			return;
		}

		this._showLogView = !!this._authenticationService.copilotToken?.isInternal || !this._envService.isProduction();
		if (this._showLogView) {
			commands.executeCommand('setContext', showLogViewContextKey, this._showLogView);
		}
	}

	private _updateDebugContext() {
		commands.executeCommand('setContext', debugContextKey, !this._envService.isProduction());
	}

	private _updatePrExtensionInstalledContext() {
		const isPrExtensionInstalled = !!extensions.getExtension(GHPR_EXTENSION_ID);
		commands.executeCommand('setContext', prExtensionInstalledContextKey, isPrExtensionInstalled);
	}

	private async _onAuthenticationChange() {
		this._inspectContext();
		this._updateQuotaExceededContext();
		this._updatePreviewFeaturesDisabledContext();
		this._updateShowLogViewContext();
		this._updatePermissiveSessionContext();
	}

	private async _updatePermissiveSessionContext() {
		let hasPermissiveSession = false;
		let missingPermissiveSession = false;
		if (!this._authenticationService.isMinimalMode) {
			try {
				hasPermissiveSession = !!(await this._authenticationService.getGitHubSession('permissive', { silent: true }));
			} catch (error) {
				if (!(error instanceof MinimalModeError)) {
					this._logService.trace(`[context keys] Failed to resolve permissive session: ${error instanceof Error ? error.message : String(error)}`);
					hasPermissiveSession = !!this._authenticationService.permissiveGitHubSession;
				}
			}
			missingPermissiveSession = !hasPermissiveSession;
		}
		commands.executeCommand('setContext', missingPermissiveSessionContextKey, missingPermissiveSession);
	}
}
