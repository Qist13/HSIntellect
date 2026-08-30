import getLogConfigPath from "./utils/path.js";
import setupLogConfig from "./hearthstone/logConfig.js";

function main() {
    const configPath = getLogConfigPath();

    setupLogConfig(configPath);
}

main();
