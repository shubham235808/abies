import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { parseAllDocuments } from "yaml";
const helm =
  process.env.HELM_BIN ||
  (existsSync(".runtime/bin/helm") ? ".runtime/bin/helm" : "helm");
const render = (release, args = []) =>
  parseAllDocuments(
    execFileSync(
      helm,
      ["template", release, "charts/abies", "-n", release, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ),
  )
    .map((d) => {
      assert.equal(d.errors.length, 0);
      return d.toJSON();
    })
    .filter(Boolean);
const primary = render("abies", [
  "-f",
  "environments/server/values.yaml",
  "--set",
  "ingress.defaultCertificate=true",
]);
const secondary = render("other", [
  "--set",
  "frontend.replicas=1",
  "--set",
  "backend.replicas=1",
  "--set",
  "ingress.enabled=false",
  "--set",
  "networkPolicy.enabled=false",
]);
assert.equal(primary.filter((x) => x.kind === "Deployment").length, 4);
assert.equal(
  primary.filter((x) => x.kind === "PersistentVolumeClaim").length,
  2,
);
assert.equal(primary.filter((x) => x.kind === "PodDisruptionBudget").length, 2);
assert.equal(primary.filter((x) => x.kind === "NetworkPolicy").length, 3);
assert.equal(
  primary.filter((x) => x.kind === "Secret").length,
  0,
  "Secrets must remain outside Git and Helm values",
);
for (const d of primary.filter((x) => x.kind === "Deployment")) {
  assert.equal(d.spec.template.spec.securityContext.runAsNonRoot, true);
  for (const [key, value] of Object.entries(d.spec.selector.matchLabels))
    assert.equal(d.spec.template.metadata.labels[key], value);
}
for (const s of primary.filter((x) => x.kind === "Service"))
  assert.ok(
    primary.some(
      (x) =>
        x.kind === "Deployment" &&
        Object.entries(s.spec.selector).every(
          ([k, v]) => x.spec.template.metadata.labels[k] === v,
        ),
    ),
    `Unmatched Service ${s.metadata.name}`,
  );
const ingress = primary.find((x) => x.kind === "Ingress");
assert.equal(
  ingress.spec.rules[0].host,
  undefined,
  "Kubernetes ingress hosts must not be IP addresses",
);
assert.ok(
  primary.some(
    (x) =>
      x.kind === "TLSStore" &&
      x.spec.defaultCertificate.secretName === "abies-tls",
  ),
);
assert.ok(
  primary
    .filter((x) => x.kind === "PersistentVolumeClaim")
    .every((x) => x.metadata.annotations["helm.sh/resource-policy"] === "keep"),
);
assert.ok(
  secondary
    .filter((x) => x.kind === "Deployment")
    .every((x) => x.metadata.name.startsWith("other-")),
);
assert.equal(
  secondary.filter((x) =>
    ["Ingress", "NetworkPolicy", "PodDisruptionBudget"].includes(x.kind),
  ).length,
  0,
);
const web = secondary.find(
  (x) => x.kind === "Deployment" && x.metadata.name === "other-frontend",
);
assert.ok(
  web.spec.template.spec.containers[0].env.some(
    (x) =>
      x.name === "API_INTERNAL_URL" && x.value === "http://other-backend:8000",
  ),
);
assert.throws(
  () => render("invalid", ["--set", "backend.replicas=0"]),
  /values|schema|minimum/,
);
console.log(
  `PASS: ${primary.length} server resources; alternate release names, service selectors, runtime API DNS, private secrets, retained storage, IP TLS and schema validation`,
);
