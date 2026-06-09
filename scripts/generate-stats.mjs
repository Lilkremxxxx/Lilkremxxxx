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

function getRowIconSvg(type, x, y) {
  const stroke = "#c792ea";

  switch (type) {
    case "star":
      return `
        <g transform="translate(${x} ${y})" stroke="${stroke}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M0 -9 L2.6 -2.8 L9 -2.8 L3.8 1.1 L5.8 8 L0 4.2 L-5.8 8 L-3.8 1.1 L-9 -2.8 L-2.6 -2.8 Z" fill="${stroke}"/>
        </g>
      `;
    case "commit":
      return `
        <g transform="translate(${x} ${y})" stroke="${stroke}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M-10 0 H-5" />
          <path d="M5 0 H10" />
          <circle cx="0" cy="0" r="4.2" fill="${stroke}" stroke="none"/>
        </g>
      `;
    case "pr":
      return `
        <g transform="translate(${x} ${y})" stroke="${stroke}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="-5" cy="-7" r="2.3"/>
          <circle cx="-5" cy="7" r="2.3"/>
          <circle cx="6" cy="0" r="2.3"/>
          <path d="M-5 -4.7 V4.7" />
          <path d="M-2.7 7 H3.7 V0" />
        </g>
      `;
    case "review":
      return `
        <g transform="translate(${x} ${y})" stroke="${stroke}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M-10 0 C-7 -4.5 -3.5 -6 0 -6 C3.5 -6 7 -4.5 10 0 C7 4.5 3.5 6 0 6 C-3.5 6 -7 4.5 -10 0 Z"/>
          <circle cx="0" cy="0" r="2.4" fill="${stroke}" stroke="none"/>
        </g>
      `;
    case "issue":
      return `
        <g transform="translate(${x} ${y})" stroke="${stroke}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="0" cy="0" r="8"/>
          <path d="M0 -4 V1" />
          <circle cx="0" cy="5" r="1.2" fill="${stroke}" stroke="none"/>
        </g>
      `;
    case "repo":
      return `
        <g transform="translate(${x} ${y})" stroke="${stroke}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="-7" y="-7" width="14" height="14" rx="1"/>
          <path d="M-3.5 -3.5 H3.5" />
          <path d="M-3.5 0 H3.5" />
          <path d="M-3.5 3.5 H1.5" />
        </g>
      `;
    default:
      return "";
  }
}

function getGithubMarkSvg(cx, cy, size) {
  const scale = size / 16;

  return `
    <g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})">
      <path fill="#1a1b27" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
      0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
      -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66
      .07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
      0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82
      .64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12
      .51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
      0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
    </g>
  `;
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
  { icon: "star", label: "Total Stars Earned:", value: totalStars },
  { icon: "commit", label: `Total Commits (${year}):`, value: yearStats.totalCommitContributions },
  { icon: "pr", label: "Total PRs:", value: yearStats.totalPullRequestContributions },
  { icon: "review", label: "Total PRs Reviewed:", value: yearStats.totalPullRequestReviewContributions },
  { icon: "issue", label: "Total Issues:", value: yearStats.totalIssueContributions },
  { icon: "repo", label: "Contributed to (last year):", value: contributedRepos.size }
];

const rowSvg = rows
  .map((row, index) => {
    const y = 86 + index * 39;

    return `
      ${getRowIconSvg(row.icon, 30, y - 1)}
      <text x="55" y="${y}" class="label" dominant-baseline="middle">${escapeXml(row.label)}</text>
      <text x="320" y="${y}" class="value" dominant-baseline="middle">${formatNumber(row.value)}</text>
    `;
  })
  .join("");

const title = `${userData.login}'s GitHub Stats`;

const svg = `
<svg width="620" height="295" viewBox="0 0 620 295" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    .title {
      font: 700 22px system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
      fill: #70a5fd;
    }

    .label {
      font: 700 16px system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
      fill: #2dd4bf;
    }

    .value {
      font: 700 16px system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
      fill: #2dd4bf;
    }
  </style>

  <rect width="620" height="295" rx="12" fill="#1a1b27"/>

  <text x="24" y="42" class="title">${escapeXml(title)}</text>

  ${rowSvg}

  <circle cx="510" cy="150" r="62" fill="#70a5fd"/>
  <circle cx="510" cy="150" r="50" fill="#1a1b27"/>
  <circle cx="510" cy="150" r="39" fill="#2dd4bf"/>
  ${getGithubMarkSvg(510, 150, 48)}
</svg>
`.trim();

fs.mkdirSync("assets", { recursive: true });
fs.writeFileSync("assets/github-stats.svg", svg);

console.log("Generated assets/github-stats.svg");