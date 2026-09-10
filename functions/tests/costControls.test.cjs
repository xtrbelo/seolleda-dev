const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const vm = require("node:vm");

test("global cost controls are registered before every function", () => {
  const events = [];
  let options;
  const source = readFileSync(require.resolve("../lib/index.js"), "utf8");
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === "firebase-functions/v2") {
        return {setGlobalOptions: (value) => {
          options = value;
          events.push("options");
        }};
      }
      if (name.startsWith("./")) {
        assert.equal(events[0], "options", `${name} loaded before cost controls`);
        events.push(name);
        return {};
      }
      throw new Error(`Unexpected import ${name}`);
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(options)), {
    memory: "256MiB",
    cpu: "gcf_gen1",
    concurrency: 1,
    minInstances: 0,
    maxInstances: 3,
    enforceAppCheck: true,
  });
  assert.equal(events.length, 18);
});
