/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AuthenticationGetSessionOptions, AuthenticationSession } from 'vscode';
import { IConfigurationService } from '../../configuration/common/configurationService';
import { ILogService } from '../../log/common/logService';
import { BaseAuthenticationService, GITHUB_SCOPE_ALIGNED, MinimalModeError, StrictAuthenticationPresentationOptions } from './authentication';
import { CopilotToken, createTestExtendedTokenInfo } from './copilotToken';
import { ICopilotTokenManager } from './copilotTokenManager';
import { ICopilotTokenStore } from './copilotTokenStore';

const NO_AUTH_FAKE_GITHUB_TOKEN = 'no-auth-fake-github-token';

const fakeTokenInfo = createTestExtendedTokenInfo({
	token: 'tid=1;exp=9999999999;sku=individual;',
	username: 'no-auth-user',
	copilot_plan: 'individual',
});

export class NoAuthAuthenticationService extends BaseAuthenticationService {
	private readonly _fakeSession: AuthenticationSession;
	private readonly _fakeCopilotToken: CopilotToken;

	constructor(
		@ILogService logService: ILogService,
		@ICopilotTokenStore tokenStore: ICopilotTokenStore,
		@ICopilotTokenManager tokenManager: ICopilotTokenManager,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super(logService, tokenStore, tokenManager, configurationService);

		this._fakeSession = {
			id: NO_AUTH_FAKE_GITHUB_TOKEN,
			accessToken: NO_AUTH_FAKE_GITHUB_TOKEN,
			scopes: GITHUB_SCOPE_ALIGNED,
			account: {
				id: 'no-auth-user',
				label: 'NoAuth User'
			}
		};

		this._anyGitHubSession = this._fakeSession;
		this._permissiveGitHubSession = this._fakeSession;

		this._fakeCopilotToken = new CopilotToken({ ...fakeTokenInfo });
		this._tokenStore.copilotToken = this._fakeCopilotToken;

		this.fireAuthenticationChange('noAuthInit');
		this._logService.info('[NoAuth] NoAuthAuthenticationService initialized - GitHub auth bypassed');
	}

	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { createIfNone: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions & { forceNewSession: StrictAuthenticationPresentationOptions }): Promise<AuthenticationSession>;
	override async getGitHubSession(kind: 'permissive' | 'any', options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined>;
	override async getGitHubSession(kind: 'permissive' | 'any', _options: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		if (kind === 'permissive') {
			if (this.isMinimalMode) {
				if (_options.createIfNone || _options.forceNewSession) {
					throw new MinimalModeError();
				}
				return undefined;
			}
			return this._fakeSession;
		}
		return this._fakeSession;
	}

	override async getCopilotToken(_force?: boolean): Promise<CopilotToken> {
		this._tokenStore.copilotToken = this._fakeCopilotToken;
		return this._fakeCopilotToken;
	}

	override resetCopilotToken(_httpError?: number): void {
		// no-op: keep fake token intact, do not clear it
	}

	override getAnyAdoSession(_options?: AuthenticationGetSessionOptions): Promise<AuthenticationSession | undefined> {
		return Promise.resolve(undefined);
	}

	override getAdoAccessTokenBase64(_options?: AuthenticationGetSessionOptions): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}
}