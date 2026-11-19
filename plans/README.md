# Animation plans (improve-animations)

Audit at commit `9bb3264`, at standard effort. The audit was done in-thread rather than fanned out to subagents. Plans are executed in order. 001 introduces tokens that the later plans use; each plan has a literal fallback.

| # | Title | Severity | Status |
| --- | --- | --- | --- |
| 001 | Shared easing tokens | LOW | TODO |
| 002 | Press feedback animates on cards/tabs | MEDIUM | TODO |
| 003 | Gentle reduced motion instead of a global kill | MEDIUM | TODO |
| 004 | Toast 400 ms `ease`; telemetry flash ease-out | LOW | TODO |
| 005 | Bottom sheet drawer curve | LOW | TODO |
| 006 | Export panel entrance | LOW | TODO |

Dependencies: 002, 004 and 005 use the `--ease-*` tokens from 001. 006 uses `pd-fade` from 003.

Cleared categories: Purpose & frequency (no motion on keyboard actions; the camera dial and timeline don't animate), Performance (only opacity and transform animate, apart from the deliberate sheet height in 005; there is no `transition: all`), and Physicality (no `scale(0)`; the modal origin is center).
