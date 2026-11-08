---
id: HX-001
title: AG Grid 사용 미확인
priority: P1
status: proposed
area: frontend
stages: [dev, qa]
acceptance:
  - AG Grid가 사용된 모든 컴포넌트에서 AG Grid를 확인해야 합니다.
  - AG Grid의 올바른 버전이 사용되고 있는지 확인해야 합니다.
---
## 배경

AG Grid는 디자인 스펙에 명시되어 있지만, 실제로 사용되지 않은 것으로 보입니다. frontend/app.js와 frontend/days/04.html에서 AG Grid 관련 코드를 확인해야 합니다.

## 범위

- AG Grid를 사용하는 모든 컴포넌트를 찾아 확인합니다.
- AG Grid의 올바른 버전이 사용되고 있는지 확인합니다.

## 참고 파일

- frontend/app.js
- frontend/days/04.html

## 출처

Tech Lead 에이전트 제안. 사람이 검토 후 `hermes-fleet approve <repo> <ID>`로 승인한다.
