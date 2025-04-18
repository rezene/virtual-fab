// webpack.config.js
const path = require('path');

module.exports = {
    entry: './webview.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'webview.js'
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/[name][ext]'
                }
            }
        ]
    },
    resolve: {
        extensions: ['.js']
    }
};