import 'dotenv/config';
import { PowerBiClient, powerBiConfigFromEnv } from './api/powerBiClient.js';

async function main() {
  const client = new PowerBiClient(powerBiConfigFromEnv());
  const workspaces = await client.getWorkspaces();
  if (workspaces.length === 0) {
    throw new Error('Power BI authentication succeeded, but the service principal has access to no workspaces.');
  }

  const matches = [];
  for (const workspace of workspaces) {
    for (const report of await client.getReports(workspace.id)) {
      const pages = await client.getPages(workspace.id, report.id);
      for (const page of pages.filter((candidate) => /YTD Sales Table/i.test(candidate.displayName))) {
        matches.push({
          workspace: workspace.name,
          workspaceId: workspace.id,
          report: report.name,
          reportId: report.id,
          datasetId: report.datasetId,
          page: page.displayName,
          pageName: page.name,
        });
      }
    }
  }

  if (matches.length === 0) throw new Error('No accessible report contains a page named YTD Sales Table.');
  console.log(JSON.stringify(matches, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Power BI discovery failed.');
  process.exitCode = 1;
});
