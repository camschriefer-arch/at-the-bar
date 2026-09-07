/** @type {import('@bacons/apple-targets/app.plugin').Config} */
// No `name`: EAS looks the target up by the plugin's sanitized product name
// ("notificationservice"), while a `name` also renames the Xcode target itself,
// and the hyphen makes the two disagree.
module.exports = {
  type: 'notification-service',
};
