const { withPodfile, withXcodeProject } = require('expo/config-plugins');

const marker = '# MCBuse: keep all pod targets compatible with the iOS deployment floor';
const hook = '  post_install do |installer|';
const settings = `
    ${marker}
    minimum_ios = [Gem::Version.new('15.1'), Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '15.1')].max
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        deployment_target = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if deployment_target && Gem::Version.correct?(deployment_target) && Gem::Version.new(deployment_target) < minimum_ios
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios.to_s
        end
      end
    end
`;

function updatePodfile(contents) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes(hook)) {
    throw new Error('Cannot apply the iOS pod deployment floor: post_install hook is missing.');
  }
  return contents.replace(hook, hook + settings);
}

module.exports = function withIosBuildCompatibility(config) {
  config = withPodfile(config, (config) => {
    config.modResults.contents = updatePodfile(config.modResults.contents);
    return config;
  });
  return withXcodeProject(config, (config) => {
    // CocoaPods' resource script writes a temporary file outside its declared outputs.
    const configurations = config.modResults.pbxXCBuildConfigurationSection();
    for (const configuration of Object.values(configurations)) {
      if (configuration.buildSettings) {
        configuration.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return config;
  });
};

module.exports.updatePodfile = updatePodfile;
