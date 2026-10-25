//The new UI's CSS through the build (vite.config.mts): the nesting and the layers reach the browser
//lowered for the target, each nested rule as the selector it means
import { build, type Rollup } from "vite";
import { expect, test } from "vitest";

test("The build lowers the new UI's nested CSS to the selectors it means, in its layers", async () => {
	const out = await build({ configFile: "vite.config.mts", logLevel: "silent", build: { write: false, rollupOptions: { input: "src/view/library.css" } } }) as Rollup.RollupOutput;
	const css = String((out.output.find((o) => o.fileName.endsWith(".css")) as Rollup.OutputAsset).source);
	expect(css).not.toContain("&");
	expect(css).toMatch(/^@layer reset\{/);
	for (const selector of [":where(.pm) :where(button)", ".pm-btn.primary:is(:hover,.is-hot)", ".pm-toggle[aria-checked=true] .track:after",
		".pm-tab[aria-selected=true]:after", ".pm-row:is(:has(>:checked),[aria-selected=true])", ".pm-meter.low :is(.i,.v,.st)"])
		expect(css).toContain(selector);
}, 60_000);
