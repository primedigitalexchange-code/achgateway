import NextAuth from 'next-auth'
import GithubProvider from 'next-auth/providers/github'
import GoogleProvider from 'next-auth/providers/google'
import type { NextAuthOptions } from 'next-auth'
import { checkGitHubOrgMembership, checkGitHubTeamMembership, checkGoogleHostedDomain } from '../../../lib/provider-checks'
import { logAuthEvent, ensureUser } from '../../../lib/audit'

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GithubProvider({
            clientId: process.env.GITHUB_ID as string,
            clientSecret: process.env.GITHUB_SECRET as string,
            authorization: { params: { scope: 'read:user read:org' } },
          }),
        ]
      : []),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            authorization: { params: { prompt: 'consent', access_type: 'offline', scope: 'openid email profile' } },
          }),
        ]
      : []),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // Enforce provider-specific organization / domain restrictions during sign-in
    async signIn({ user, account, profile, email, credentials }) {
      // Ensure we have a user email
      const userEmail = (user && (user.email as string)) || null
      const provider = account?.provider || 'unknown'

      // Ensure user entry exists in audit DB
      if (userEmail) ensureUser(userEmail, user.name as string | undefined)

      try {
        if (provider === 'github') {
          // If GITHUB_ORG is configured, require membership
          const org = process.env.GITHUB_ORG
          const team = process.env.GITHUB_TEAM_SLUG || process.env.GITHUB_TEAM_ID
          if (org) {
            // profile.login is GitHub username
            const username = (profile && (profile.login as string)) || (user?.name as string) || ''
            const isMember = await checkGitHubOrgMembership(username, account?.access_token as string)
            if (!isMember) {
              await logAuthEvent(userEmail, 'github', `Missing org membership: ${org}`)
              return false
            }
            if (team) {
              const isTeamMember = await checkGitHubTeamMembership(username, org, team, account?.access_token as string)
              if (!isTeamMember) {
                await logAuthEvent(userEmail, 'github', `Missing team membership: ${team} in org ${org}`)
                return false
              }
            }
          }
        }

        if (provider === 'google') {
          const hosted = process.env.GOOGLE_HOSTED_DOMAIN
          if (hosted) {
            const ok = checkGoogleHostedDomain(userEmail || '', hosted)
            if (!ok) {
              // Log rejected sign-in for auditing
              await logAuthEvent(userEmail, 'google', `Email domain not allowed: ${userEmail}`)
              return false
            }
          }
        }

        // Optionally enforce ADMIN_EMAIL_ALLOWLIST
        const adminAllowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean)
        if (adminAllowlist.length > 0 && userEmail) {
          if (!adminAllowlist.includes(userEmail)) {
            await logAuthEvent(userEmail, provider, `Email not in admin allowlist`)
            return false
          }
        }

        return true
      } catch (err: any) {
        console.warn('Error in signIn callback:', err?.message)
        await logAuthEvent(userEmail, provider, `Error during sign-in checks: ${err?.message}`)
        return false
      }
    },
  },
}

export default NextAuth(authOptions)
