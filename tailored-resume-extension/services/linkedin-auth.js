const LinkedInAuth = {
  CLIENT_ID: 'YOUR_LINKEDIN_CLIENT_ID',
  REDIRECT_URI: chrome.identity.getRedirectURL('linkedin'),
  SCOPES: 'openid profile email',

  async login() {
    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', this.CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', this.REDIRECT_URI);
    authUrl.searchParams.set('scope', this.SCOPES);
    authUrl.searchParams.set('state', crypto.randomUUID());

    try {
      const redirectUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
      });

      const url = new URL(redirectUrl);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) throw new Error(`LinkedIn OAuth denied: ${error}`);
      if (!code) throw new Error('No authorization code received');

      await chrome.storage.local.set({
        linkedinAuth: { code, timestamp: Date.now(), authenticated: true }
      });

      return { success: true, code };
    } catch (err) {
      console.error('LinkedIn OAuth error:', err);
      return { success: false, error: err.message };
    }
  },

  async logout() {
    await chrome.storage.local.remove(['linkedinAuth', 'linkedinProfile']);
    return { success: true };
  },

  async getAuthState() {
    const { linkedinAuth } = await chrome.storage.local.get('linkedinAuth');
    return { authenticated: !!linkedinAuth?.authenticated, timestamp: linkedinAuth?.timestamp };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LinkedInAuth;
}
