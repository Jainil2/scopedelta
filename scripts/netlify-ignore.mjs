const isUnorchestratedProductionBuild =
  process.env.CONTEXT === "production" &&
  process.env.SCOPEDELTA_DEPLOY_ORCHESTRATED !== "true";

if (isUnorchestratedProductionBuild) {
  process.stdout.write(
    "Skipping automatic production build; GitHub performs migrations before deploy.\n",
  );
  process.exit(0);
}

process.exit(1);
