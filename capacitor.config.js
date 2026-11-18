const config = {
    appId: "com.bilidesk.app",
    appName: "BiliLoft",
    webDir: "dist/mobile",
    android: {
        allowMixedContent: true,
    },
    plugins: {
        CapacitorHttp: {
            enabled: true,
        },
    },
};
export default config;
