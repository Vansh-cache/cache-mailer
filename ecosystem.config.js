module.exports = {
  apps: [
    {
      name: "mailer-api",
      cwd: "./apps/server",
      script: "dist/index.js",
      env: { API_PORT: 4000 },
    },
    {
      name: "mailer-worker",
      cwd: "./apps/server",
      script: "dist/worker.js",
    },
    {
      name: "mailer-tracking",
      cwd: "./apps/server",
      script: "dist/tracking.js",
      env: { TRACKING_PORT: 4100 },
    },
  ],
};
