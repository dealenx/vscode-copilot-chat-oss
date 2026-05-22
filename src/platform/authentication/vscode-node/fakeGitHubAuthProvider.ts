/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AuthenticationProvider, AuthenticationProviderAuthenticationSessionsChangeEvent, AuthenticationSession, Disposable, Event, EventEmitter, authentication, commands, ExtensionContext } from 'vscode';

const FAKE_SESSION_ID = 'no-auth-github-session';
const FAKE_ACCOUNT_ID = 'no-auth-github-account';
const FAKE_ACCOUNT_LABEL = 'NoAuth User';
const FAKE_ACCESS_TOKEN = 'no-auth-fake-github-token';
const FAKE_SCOPES = ['read:user', 'user:email', 'repo', 'workflow'];

const LOG_PREFIX = '[NoAuth]';

export class FakeGitHubAuthenticationProvider implements AuthenticationProvider, Disposable {
	private _sessions: AuthenticationSession[];
	private _onDidChangeSessions = new EventEmitter<AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions: Event<AuthenticationProviderAuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	constructor() {
		this._sessions = [FakeGitHubAuthenticationProvider.createSession()];
	}

	private static createSession(): AuthenticationSession {
		return {
			id: FAKE_SESSION_ID,
			accessToken: FAKE_ACCESS_TOKEN,
			scopes: FAKE_SCOPES,
			account: {
				id: FAKE_ACCOUNT_ID,
				label: FAKE_ACCOUNT_LABEL,
			},
		};
	}

	async getSessions(_scopes?: readonly string[]): Promise<AuthenticationSession[]> {
		return [...this._sessions];
	}

	async createSession(scopes: readonly string[]): Promise<AuthenticationSession> {
		const session = FakeGitHubAuthenticationProvider.createSession();
		this._sessions = [session];
		this._onDidChangeSessions.fire({ added: [session], changed: [], removed: [] });
		return session;
	}

	async removeSession(_sessionId: string): Promise<void> {
	}

	fireInitialSession(): void {
		if (this._sessions.length > 0) {
			this._onDidChangeSessions.fire({ added: [...this._sessions], changed: [], removed: [] });
		}
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

function forceEntitlementContext(): void {
	commands.executeCommand('setContext', 'chatEntitlementSignedOut', false);
	commands.executeCommand('setContext', 'chatIsEnabled', true);
	commands.executeCommand('setContext', 'chatSetupInstalled', true);
	commands.executeCommand('setContext', 'chatSetupHidden', false);
	commands.executeCommand('setContext', 'chatSetupDisabled', false);
	commands.executeCommand('setContext', 'chatSetupDisabledInWorkspace', false);
	commands.executeCommand('setContext', 'chatSetupUntrusted', false);
	commands.executeCommand('setContext', 'chatSetupLater', false);
	commands.executeCommand('setContext', 'chatSetupRegistered', true);
	commands.executeCommand('setContext', 'chatSetupCompleted', true);
	commands.executeCommand('setContext', 'chatPlanCanSignUp', false);
	commands.executeCommand('setContext', 'chatPlanFree', false);
	commands.executeCommand('setContext', 'chatPlanPro', true);
	commands.executeCommand('setContext', 'chatPlanEdu', false);
	commands.executeCommand('setContext', 'chatPlanProPlus', false);
	commands.executeCommand('setContext', 'chatPlanBusiness', false);
	commands.executeCommand('setContext', 'chatPlanEnterprise', false);
	commands.executeCommand('setContext', 'chatEntitlementOrganisations', undefined);
	commands.executeCommand('setContext', 'chatEntitlementInternal', false);
	commands.executeCommand('setContext', 'chatSetupContribution', true);
	commands.executeCommand('setContext', 'chatQuotaExceeded', false);
	commands.executeCommand('setContext', 'completionsQuotaExceeded', false);
	commands.executeCommand('setContext', 'chatAnonymous', false);
	commands.executeCommand('setContext', 'github.copilot-chat.activated', true);
	commands.executeCommand('setContext', 'github.copilot.interactiveSession.disabled', false);
	commands.executeCommand('setContext', 'chat.setup.installed', true);
	commands.executeCommand('setContext', 'chat.setup.hidden', false);
	commands.executeCommand('setContext', 'chat.entitlement.signedOut', false);
	commands.executeCommand('setContext', 'chat.entitlement.canSignUp', false);
	commands.executeCommand('setContext', 'chat.entitlement.limited', false);
	commands.executeCommand('setContext', 'chat.entitlement.pro', true);
	commands.executeCommand('setContext', 'chat.entitlement.proPlus', false);
}

const CHAT_SETUP_CONTEXT_KEY = 'chat.setupContext';
const CHAT_SETUP_CONTEXT_MIGRATED_KEY = 'chat.setupContext.migrated.v1';
const CHAT_SETUP_STATE = {
	entitlement: 6,
	installed: true,
	disabled: false,
	untrusted: false,
	disabledInWorkspace: false,
	hidden: false,
	registered: true,
	completed: true,
};

export async function registerGitHubAuthProviderAndForceEntitlement(context: ExtensionContext): Promise<void> {
	console.log(`${LOG_PREFIX} Starting entitlement bypass...`);

	await context.globalState.update(CHAT_SETUP_CONTEXT_KEY, CHAT_SETUP_STATE);
	await context.globalState.update(CHAT_SETUP_CONTEXT_MIGRATED_KEY, true);
	console.log(`${LOG_PREFIX} Wrote chat.setupContext to globalState`);

	forceEntitlementContext();

	const provider = new FakeGitHubAuthenticationProvider();
	let providerRegistered = false;

	const tryRegisterProvider = (): boolean => {
		try {
			const disposable = authentication.registerAuthenticationProvider(
				'github',
				'GitHub',
				provider,
				{ supportsMultipleAccounts: false }
			);
			context.subscriptions.push(disposable);
			context.subscriptions.push(provider);
			providerRegistered = true;
			console.log(`${LOG_PREFIX} Successfully registered fake 'github' auth provider`);
			return true;
		} catch (e) {
			console.log(`${LOG_PREFIX} Could not register 'github' auth provider (already registered): ${e}`);
			return false;
		}
	};

	tryRegisterProvider();

	if (providerRegistered) {
		await new Promise(resolve => setTimeout(resolve, 200));
		provider.fireInitialSession();
		console.log(`${LOG_PREFIX} Fired initial session event`);
	}

	forceEntitlementContext();

	context.subscriptions.push(authentication.onDidChangeSessions((e) => {
		console.log(`${LOG_PREFIX} Auth sessions changed for provider: ${e.provider.id}`);
		forceEntitlementContext();
	}));

	const AGGRESSIVE_PHASE_MS = 50;
	const AGGRESSIVE_DURATION_MS = 30000;
	const NORMAL_PHASE_MS = 200;
	const startTime = Date.now();

	const forceInterval = setInterval(() => {
		forceEntitlementContext();
		const elapsed = Date.now() - startTime;
		if (elapsed > AGGRESSIVE_DURATION_MS && providerRegistered) {
			clearInterval(forceInterval);
			const normalInterval = setInterval(forceEntitlementContext, NORMAL_PHASE_MS);
			context.subscriptions.push(new Disposable(() => clearInterval(normalInterval)));
			console.log(`${LOG_PREFIX} Switched to normal polling (${NORMAL_PHASE_MS}ms)`);
		}
	}, AGGRESSIVE_PHASE_MS);
	context.subscriptions.push(new Disposable(() => clearInterval(forceInterval)));

	console.log(`${LOG_PREFIX} Entitlement bypass active (aggressive ${AGGRESSIVE_PHASE_MS}ms for ${AGGRESSIVE_DURATION_MS / 1000}s, then ${NORMAL_PHASE_MS}ms)`);
}