const esbuild = require('esbuild');
const { copy } = require('esbuild-plugin-copy');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log(`[${build.initialOptions.outfile}] build started`);
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log(`[${build.initialOptions.outfile}] build finished`);
        });
    },
};

async function main() {
    // Build the extension code
    const extensionCtx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [
            esbuildProblemMatcherPlugin,
        ],
    });

    // Build the webview code
    const webviewCtx = await esbuild.context({
        entryPoints: ['webview.js'],
        bundle: true,
        format: 'iife', // IIFE for browser environment (webview)
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'browser',
        outfile: 'dist/webview.js',
        logLevel: 'silent',
        // Configure loaders for font files
        loader: {
            '.eot': 'file',
            '.woff': 'file',
            '.woff2': 'file',
            '.ttf': 'file',
            '.svg': 'file',
        },
        // Ensure the fonts are output to dist/assets/
        assetNames: 'assets/[name]-[hash]',
        // Prevent tree-shaking from breaking dependency injection
        treeShaking: production ? true : false, // Disable in dev for safety
        plugins: [
            esbuildProblemMatcherPlugin,
            
            copy({
                assets: [
                    {
                      from: ['node_modules/bpmn-js/dist/assets/**/*'],
                      to: ['assets'], // Copies bpmn-js assets to dist/assets
                    },
                    {
                      from: ['media/styles/**/*'],
                      to: ['assets'], // Copies properties-panel assets to dist/assets
                    },
                    {
                        from: ['node_modules/bpmn-js-color-picker/colors/color-picker.css'],
                        to: ['assets'],
                      },
                      {
                        from: ['node_modules/bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css'],
                        to: ['assets'],
                      }
                  ],
            }),
        ],
    });

    if (watch) {
        // Watch both builds
        await Promise.all([
            extensionCtx.watch(),
            webviewCtx.watch()
        ]);
    } else {
        // Build both and dispose
        await Promise.all([
            extensionCtx.rebuild(),
            webviewCtx.rebuild()
        ]);
        await Promise.all([
            extensionCtx.dispose(),
            webviewCtx.dispose()
        ]);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});