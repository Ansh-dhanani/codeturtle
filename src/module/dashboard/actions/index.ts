"use server";

import { fetchUserContribution, getGithubToken } from "@/module/github/github";
import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type ContributionDay = {
  date: string;
  contributionCount: number;
  color: string;
};

type ContributionWeek = {
  contributionDays: ContributionDay[];
};

type MonthlyContributionDay = {
  date: string;
  contributionCount: number;
};

type MonthlyContributionWeek = {
  contributionDays: MonthlyContributionDay[];
};

// Sample review data for last 6 months
const SAMPLE_REVIEWS = [10, 8, 7, 6, 5, 8];

export async function getContributionGraph() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Unauthorized");
  }
  const token = await getGithubToken();
  if (!token) {
    throw new Error("No GitHub token found");
  }
  const { data: user } = await new Octokit({
    auth: token,
  }).rest.users.getAuthenticated();
  const calendar = await fetchUserContribution(token, user.login);

  if (!calendar) {
    throw new Error("Failed to fetch contribution data");
  }

  const contributions = calendar.weeks.flatMap((week: ContributionWeek) =>
      week.contributionDays.map((day: ContributionDay) => ({
          date: day.date,
          count: day.contributionCount,
          color: day.color,
          level: Math.min(4, Math.floor(day.contributionCount / 3))
      }))
  );
  return {
      contributions,
      totalContributions: calendar.totalContributions,
  }
}

export async function getDashboardStats() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("Unauthorized");
  }
  const token = await getGithubToken();
  if (!token) {
    throw new Error("No GitHub token found");
  }
  const octokit = new Octokit({
    auth: token,
  });

  const { data: user } = await octokit.rest.users.getAuthenticated();

  //todo to fetch total connected repos
  const totalRepos = 30;
  const calendar = await fetchUserContribution(token, user.login);
  const totalCommits = calendar?.totalContributions || 0;

  const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
    q: `is:pr author:${user.login} `,
  });
  const totalPRs = prs.total_count || 0;

  // Calculate total AI reviews from monthly sample data
  const totalAIReviews = SAMPLE_REVIEWS.reduce((sum, val) => sum + val, 0);

  return {
    totalRepos,
    totalCommits,
    totalPRs,
    totalAIReviews,
  };
}

/**
 * Fetches the monthly activity data for the authenticated user from GitHub,
 * including commits, pull requests (PRs), and reviews over the last 6 months.
 * 
 * This function retrieves the user's contribution calendar to count commits per month,
 * and uses the GitHub search API to count PRs created by the user. Reviews are currently
 * not implemented and default to 0.
 * 
 * @returns A promise that resolves to an array of objects, each containing the month name
 * (e.g., "Jan 2023"), and the counts for commits, PRs, and reviews. Returns null if an error occurs.
 * @throws {Error} If the user is unauthorized or no GitHub token is found.
 */
export async function getMonthlyActivity() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      throw new Error("Unauthorized");
    }
    const token = await getGithubToken();
    if (!token) {
      throw new Error("No GitHub token found");
    }
    const octokit = new Octokit({
      auth: token,
    });

    const { data: user } = await octokit.rest.users.getAuthenticated();

    const calendar = await fetchUserContribution(token, user.login);

    const monthlyData: {
      [key: string]: { commits: number; prs: number; reviews: number };
    } = {};

    const monthsNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${monthsNames[date.getMonth()]} ${date.getFullYear()}`;
      monthlyData[monthKey] = { commits: 0, prs: 0, reviews: 0 };
    }

    calendar?.weeks.forEach((week: MonthlyContributionWeek) => {
      week.contributionDays.forEach((day: MonthlyContributionDay) => {
        const date = new Date(day.date);
        const monthKey = `${
          monthsNames[date.getMonth()]
        } ${date.getFullYear()}`;
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].commits += day.contributionCount;
        }
      });
    });

    // Fetch PRs and reviews from GitHub API
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // TODO: Fetch real review data from database
    // Reviews remain at 0 until implemented

    const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
      q: `is:pr author:${user.login} type:pr created:>=${
        sixMonthsAgo.toISOString().split("T")[0]
      }`,
      per_page: 100,
    });

    prs.items.forEach((pr) => {
      const prDate = new Date(pr.created_at);
      const monthKey = `${
        monthsNames[prDate.getMonth()]
      } ${prDate.getFullYear()}`;
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].prs += 1;
      }
    });

    // Add sample review data that sums to total AI reviews
    let reviewIndex = 0;
    Object.keys(monthlyData).forEach((monthKey) => {
      monthlyData[monthKey].reviews = SAMPLE_REVIEWS[reviewIndex] || 0;
      reviewIndex++;
    });

    return Object.keys(monthlyData).map((name) => ({
      name,
      ...monthlyData[name],
    }));
  } catch (error) {
    console.error("Error fetching monthly activity:", error);
    return null;
  }
}
