// Two rules of the new UI's CSS that stylelint has no rule for (docs/ui/handoff.md, CSS): every rule
// sits in a cascade layer, and motion only plays for those who haven't asked for less of it.
import stylelint from "stylelint";

const { createPlugin, utils: { report, ruleMessages } } = stylelint;

//The at-rules a node is inside, nearest first
function* ancestors(node) {
	for (let up = node.parent; up; up = up.parent) if (up.type === "atrule") yield up;
}

const LAYER = "openpanzer/rule-in-layer";
const layerMessages = ruleMessages(LAYER, { rejected: (selector) => `"${selector}" is outside @layer: put it in reset, tokens, base, components or utilities` });

//A keyframe's steps are rules too, but they belong to their @keyframes
const inLayer = (rule) => [...ancestors(rule)].some((at) => at.name === "layer" || at.name === "keyframes");

const ruleInLayer = createPlugin(LAYER, (on) => (root, result) => {
	if (!on) return;
	root.walkRules((rule) => {
		if (!inLayer(rule)) report({ ruleName: LAYER, result, node: rule, message: layerMessages.rejected(rule.selector) });
	});
});

const MOTION = "openpanzer/motion-if-no-preference";
const motionMessages = ruleMessages(MOTION, { rejected: (prop) => `${prop} outside @media (prefers-reduced-motion: no-preference)` });

const allowsMotion = (decl) => [...ancestors(decl)].some((at) => at.name === "media" && /prefers-reduced-motion:\s*no-preference/.test(at.params));

const motionIfNoPreference = createPlugin(MOTION, (on) => (root, result) => {
	if (!on) return;
	root.walkDecls(/^(animation|transition)/, (decl) => {
		if (decl.value !== "none" && !allowsMotion(decl)) report({ ruleName: MOTION, result, node: decl, message: motionMessages.rejected(decl.prop) });
	});
});

export default [ruleInLayer, motionIfNoPreference];
