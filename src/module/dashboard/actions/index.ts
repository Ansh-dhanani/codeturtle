"use server";

import { fetchUserContribution, getGithubToken } from "@/module/github/github";
import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

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

  const contributions = calendar.weeks.flatMap((week: { contributionDays: Array<{ date: string; contributionCount: number; color: string }> }) =>
      week.contributionDays.map((day: { date: string; contributionCount: number; color: string }) => ({
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

  const totalRepos = await prisma.repository.count({
    where: { userId: session.user.id },
  });
  const calendar = await fetchUserContribution(token, user.login);
  const totalCommits = calendar?.totalContributions || 0;

  const { data: prs } = await octokit.rest.search.issuesAndPullRequests({
    q: `is:pr author:${user.login} `,
  });
  const totalPRs = prs.total_count || 0;

  const totalAIReviews = await prisma.codeReview.count({
    where: { userId: session.user.id, status: "completed" },
  });

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

    calendar?.weeks.forEach((week: { contributionDays: Array<{ date: string; contributionCount: number }> }) => {
      week.contributionDays.forEach((day: { date: string; contributionCount: number }) => {
        const date = new Date(day.date);
        const monthKey = `${
          monthsNames[date.getMonth()]
        } ${date.getFullYear()}`;
        if (monthlyData[monthKey]) {
          monthlyData[monthKey].commits += day.contributionCount;
        }
      });
    });

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

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

    const reviews = await prisma.codeReview.findMany({
      where: {
        userId: session.user.id,
        status: "completed",
        createdAt: { gte: sixMonthsAgo },
      },
      orderBy: { createdAt: "asc" },
    });

    reviews.forEach((review) => {
      const reviewDate = new Date(review.createdAt);
      const monthKey = `${
        monthsNames[reviewDate.getMonth()]
      } ${reviewDate.getFullYear()}`;
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].reviews += 1;
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
