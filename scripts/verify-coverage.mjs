import { appendFile, readFile } from "node:fs/promises";

const reportPaths = process.argv.slice(2);

if (reportPaths.length === 0) {
  throw new Error("Pass at least one LCOV report path to verify.");
}

const rows = [];

for (const reportPath of reportPaths) {
  const report = await readFile(reportPath, "utf8");
  const linesFound = sumMetric(report, "LF");
  const linesCovered = sumMetric(report, "LH");

  if (linesFound === 0) {
    throw new Error(`${reportPath} contains no instrumented executable lines.`);
  }

  if (linesCovered === 0) {
    throw new Error(`${reportPath} contains zero covered executable lines.`);
  }

  const percentage = ((linesCovered / linesFound) * 100).toFixed(2);
  rows.push({ reportPath, linesFound, linesCovered, percentage });
  console.log(
    `${reportPath}: ${linesCovered}/${linesFound} executable lines covered (${percentage}%).`,
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const table = [
    "## Executable coverage evidence",
    "",
    "| LCOV report | Covered lines | Instrumented lines | Coverage |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(
      ({ reportPath, linesCovered, linesFound, percentage }) =>
        `| \`${reportPath}\` | ${linesCovered} | ${linesFound} | ${percentage}% |`,
    ),
    "",
    "This check verifies that executable tests produced a non-empty LCOV report with covered lines; it does not impose an arbitrary percentage threshold.",
    "",
  ].join("\n");

  await appendFile(process.env.GITHUB_STEP_SUMMARY, table);
}

function sumMetric(report, metric) {
  const prefix = `${metric}:`;

  return report.split("\n").reduce((total, line) => {
    if (!line.startsWith(prefix)) return total;

    const value = Number.parseInt(line.slice(prefix.length), 10);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid ${metric} entry in LCOV report: ${line}`);
    }

    return total + value;
  }, 0);
}
