# polyfill dependencies
# NOTE: we don't update demitasse because our tests aren't compatible with its latest version
npx npm-check-updates -u -x @pipobscure/demitasse,@pipobscure/demitasse-pretty,@pipobscure/demitasse-run
npm install
