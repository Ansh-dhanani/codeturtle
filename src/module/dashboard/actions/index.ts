"use server";

import { fetchUserContribution, getGithubToken } from "@/module/github/github";
import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

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
  const totalCommits = calendar?.contributionCalendar?.totalContributions || 0;

  const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
    q: `is:pr author:${user.login} `,
  });
  const totalPRs = prs.total_count || 0;

  //todo count ai reviews from db

  const totalAIReviews = 44;

  return {
    totalRepos,
    totalCommits,
    totalPRs,
    totalAIReviews,
  };
}

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

    calendar?.contributionCalendar?.weeks.forEach((week:any) => {
      week.contributionDays.forEach((day:any) => {
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
    return Object.keys(monthlyData).map((name) => ({
      name,
      ...monthlyData[name],
    }));
  } catch (error) {
    console.error("Error fetching monthly activity:", error);
    return null;
  }
}
