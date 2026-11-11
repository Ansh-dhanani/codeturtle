"use client";

/**
 * Thin wrapper around Umami (https://umami.is) custom events.
 * No-ops silently when Umami isn't loaded (missing website id, ad blockers, SSR).
 */

declare global {
  interface Window {
    umami?: {
      track: (event?: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

export const AnalyticsEvents = {
  /** Hero primary CTA - "Start reviewing free" */
  ctaStartReviewing: "cta_start_reviewing_free",
  /** Hero secondary CTA - "See how it works" */
  ctaSeeHowItWorks: "cta_see_how_it_works",
  /** GitHub OAuth button on the login page */
  githubSignIn: "github_sign_in_clicked",
  /** Pricing card click on the public site (data: plan, frequency) */
  planClicked: "plan_clicked",
  /** Upgrade button on the dashboard billing page (data: plan) */
  upgradeStarted: "upgrade_started",
  /** Checkout redirect to Polar initiated (data: plan) */
  checkoutStarted: "checkout_started",
  /** Polar customer portal opened */
  billingPortalOpened: "billing_portal_opened",
  /** Repository connected successfully (data: repo) */
  repositoryConnected: "repository_connected",
  /** Any mailto:dhananiansh01@gmail.com click on the support page */
  supportEmailClicked: "support_email_clicked",
  /** Markdown analytics report downloaded (data: scope) */
  reportDownloaded: "report_downloaded",
  /** Review finding upvoted/downvoted (data: rating) */
  feedbackGiven: "review_feedback_given",
  /** Fix PR generated from a review finding */
  fixPrRequested: "fix_pr_requested",
  /** AI provider/model saved in settings (data: provider, model) */
  aiModelSaved: "ai_model_saved",
  /** Search palette opened (button or keyboard shortcut) */
  commandPaletteOpened: "command_palette_opened",
  /** Notifications inbox opened from the bell */
  notificationsOpened: "notifications_opened",
} as const;

export function trackEvent(
  event: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(event, data);
  } catch (error) {
    // Analytics must never break the app
    console.warn("[analytics] umami track failed:", error);
  }
}
