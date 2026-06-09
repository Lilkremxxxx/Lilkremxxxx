import fs from "node:fs";

const TOKEN = process.env.GH_TOKEN;
const USERNAME = process.env.GITHUB_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;

if (!TOKEN) throw new Error("Missing GH_TOKEN");
if (!USERNAME) throw new Error("Missing GITHUB_USERNAME");

const now = new Date();
const year = now.getUTCFullYear();

const yearFrom = `${year}-01-01T00:00:00Z`;
const nowIso = now.toISOString();

const lastYear = new Date(now);
lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1);
const lastYearFrom = lastYear.toISOString();

const QUERY = `
query ProfileStats(
  $login: String!
  $yearFrom: DateTime!
  $lastYearFrom: DateTime!
  $now: DateTime!
  $after: String
) {
  user(login: $login) {
    login

    repositories(
      first: 100
      after: $after
      ownerAffiliations: [OWNER]
      visibility: PUBLIC
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        stargazerCount
        isFork
      }
    }

    yearStats: contributionsCollection(from: $yearFrom, to: $now) {
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalIssueContributions
    }

    lastYearStats: contributionsCollection(from: $lastYearFrom, to: $now) {
      commitContributionsByRepository(maxRepositories: 100) {
        repository {
          nameWithOwner
        }
      }
      issueContributionsByRepository(maxRepositories: 100) {
        repository {
          nameWithOwner
        }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        repository {
          nameWithOwner
        }
      }
      pullRequestReviewContributionsByRepository(maxRepositories: 100) {
        repository {
          nameWithOwner
        }
      }
      repositoryContributions(first: 100) {
        nodes {
          repository {
            nameWithOwner
          }
        }
      }
    }
  }
}
`;

async function graphql(query, variables) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "github-profile-stats-card"
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await response.json();

  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2));
  }

  return json.data;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function collectRepoNames(items) {
  return (items || [])
    .map((item) => item.repository?.nameWithOwner)
    .filter(Boolean);
}

let after = null;
let totalStars = 0;
let userData = null;

do {
  const data = await graphql(QUERY, {
    login: USERNAME,
    yearFrom,
    lastYearFrom,
    now: nowIso,
    after
  });

  if (!data.user) {
    throw new Error(`GitHub user not found: ${USERNAME}`);
  }

  userData = data.user;

  for (const repo of data.user.repositories.nodes || []) {
    if (!repo.isFork) {
      totalStars += repo.stargazerCount;
    }
  }

  const pageInfo = data.user.repositories.pageInfo;
  after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (after);

const yearStats = userData.yearStats;
const lastYearStats = userData.lastYearStats;

const contributedRepos = new Set([
  ...collectRepoNames(lastYearStats.commitContributionsByRepository),
  ...collectRepoNames(lastYearStats.issueContributionsByRepository),
  ...collectRepoNames(lastYearStats.pullRequestContributionsByRepository),
  ...collectRepoNames(lastYearStats.pullRequestReviewContributionsByRepository),
  ...collectRepoNames(lastYearStats.repositoryContributions.nodes)
]);

const rows = [
  ["★", "Total Stars Earned:", totalStars],
  ["●", `Total Commits (${year}):`, yearStats.totalCommitContributions],
  ["⑂", "Total PRs:", yearStats.totalPullRequestContributions],
  ["◉", "Total PRs Reviewed:", yearStats.totalPullRequestReviewContributions],
  ["!", "Total Issues:", yearStats.totalIssueContributions],
  ["▣", "Contributed to (last year):", contributedRepos.size]
];

const rowSvg = rows
  .map((row, index) => {
    const y = 78 + index * 32;
    const [icon, label, value] = row;

    return `
      <text x="24" y="${y}" class="icon">${escapeXml(icon)}</text>
      <text x="55" y="${y}" class="label">${escapeXml(label)}</text>
      <text x="310" y="${y}" class="value">${formatNumber(value)}</text>
    `;
  })
  .join("");

const title = `${userData.login}'s GitHub Stats`;

const svg = `
<svg width="600" height="275" viewBox="0 0 600 275" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title {
      font: 600 22px Arial, sans-serif;
      fill: #70a5fd;
    }

    .label {
      font: 700 17px Arial, sans-serif;
      fill: #2dd4bf;
    }

    .value {
      font: 700 17px Arial, sans-serif;
      fill: #2dd4bf;
    }

    .icon {
      font: 700 20px Arial, sans-serif;
      fill: #c792ea;
    }

    .gh {
      font: 800 40px Arial, sans-serif;
      fill: #2dd4bf;
    }
  </style>

  <rect width="600" height="275" rx="8" fill="#1a1b27"/>

  <text x="24" y="38" class="title">${escapeXml(title)}</text>

  ${rowSvg}

  <circle cx="485" cy="145" r="58" fill="#70a5fd"/>
  <circle cx="485" cy="145" r="48" fill="#1a1b27"/>
  <circle cx="485" cy="145" r="39" fill="#2dd4bf"/>
  <text x="485" y="159" text-anchor="middle" class="gh">GH</text>
</svg>
`.trim();

fs.mkdirSync("assets", { recursive: true });
fs.writeFileSync("assets/github-stats.svg", svg);

console.log("Generated assets/github-stats.svg");