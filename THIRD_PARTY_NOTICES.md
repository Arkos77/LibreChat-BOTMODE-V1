# Third-party notices

LibreChat BOTMODE V1 is based on LibreChat and includes third-party dependencies with their own licences.

## LibreChat

Upstream: https://github.com/danny-avila/LibreChat

The repository root retains the MIT licence used by current upstream LibreChat.

## CodeSandbox Nodebox

The installed dependency tree currently includes:

```text
@librechat/frontend
└─ @codesandbox/sandpack-react@2.19.10
   └─ @codesandbox/sandpack-client@2.19.8
      └─ @codesandbox/nodebox@0.1.8
```

`@codesandbox/nodebox@0.1.8` declares `SEE LICENSE IN ./LICENSE` and ships the **Sustainable Use License 1.0**.

That licence includes restrictions on use, modification and redistribution, including commercial-use limitations. Users intending to redistribute BOTMODE or use it commercially should review the dependency's exact licence terms and assess whether the dependency should be replaced or removed for their use case.

This notice does not replace the licence files shipped with dependencies and is not legal advice.

## Dependency licences

All other dependencies continue to be governed by their respective licence files and package metadata. A release audit should be repeated when dependency versions materially change.
