---
id: HX-002
title: ApexCharts/Lightweight Charts 선택 미확인
priority: P1
status: proposed
area: frontend
stages: [dev, qa]
acceptance:
  - ApexCharts 또는 Lightweight Charts가 사용된 모든 컴포넌트에서 선택된 차트 라이브러리가 확인해야 합니다.
  - 선택된 차트 라이브러리의 올바른 버전이 사용되고 있는지 확인해야 합니다.
---
## 배경

디자인 스펙에 ApexCharts 또는 Lightweight Charts 중 하나를 선택해야 하는데, 실제로 사용되지 않은 것으로 보입니다. frontend/days/04.html에서 차트 라이브러리 관련 코드를 확인해야 합니다.

## 범위

- ApexCharts 또는 Lightweight Charts를 사용하는 모든 컴포넌트를 찾아 확인합니다.
- 선택된 차트 라이브러리의 올바른 버전이 사용되고 있는지 확인합니다.

## 참고 파일

- frontend/days/04.html

## 출처

Tech Lead 에이전트 제안. 사람이 검토 후 `hermes-fleet approve <repo> <ID>`로 승인한다.
