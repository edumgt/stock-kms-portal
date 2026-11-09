---
id: HX-003
title: KST 시간 표시 문제 확인
priority: P1
status: todo
area: frontend
stages: [dev, qa]
acceptance:
  - QA가 TZ=UTC 환경에서 KST 시간이 정확하게 표시되는지 확인
---
## 배경

frontend/app.js (3512 lines), frontend/auth.js (87 lines), frontend/capture.js (56 lines), frontend/chatbot.js (95 lines), frontend/days/01.html (3774 lines), frontend/days/02.html (4317 lines), frontend/days/03.html (3690 lines), frontend/days/04.html (4718 lines), frontend/days/assets/app-shell.css (550 lines), frontend/days/assets/app-shell.js (26 lines), frontend/days/assets/atlas.js (28 lines), frontend/days/assets/black-swan-events.js (178 lines), frontend/days/assets/central-bank-volatility.css (67 lines), frontend/days/assets/central-bank-volatility.js (159 lines), frontend/days/assets/data-library-reader.js (109 lines), frontend/days/assets/duration-use-case-simulators.css (235 lines), frontend/days/assets/duration-use-case-simulators.js (213 lines), frontend/days/assets/emerging-market-detail.css (119 lines), frontend/days/assets/emerging-market-modal.css (1 lines), frontend/days/assets/etf-role-detail.css (36 lines), frontend/days/assets/fund-case-market.css (1 lines), frontend/days/assets/fund-manager-add-row.css (2 lines), frontend/days/assets/glossary-drawer.js (92 lines), frontend/days/assets/glossary-modal.js (322 lines), frontend/days/assets/growth-potential-rate.js (174 lines), frontend/days/assets/lesson-understanding.js (102 lines), frontend/days/assets/site.css (132 lines), frontend/days/assets/site.js (33 lines), frontend/days/assets/visuals.js (145 lines), frontend/days/index.html (20 lines), frontend/index.html (241 lines), frontend/investment-native/index.html (224 lines), frontend/investment-native/js/api.js (83 lines), frontend/investment-native/js/app.js (572 lines), frontend/investment-native/js/auth.js (108 lines), frontend/investment-native/js/data/learnDocs.js (57 lines), frontend/investment-native/js/includeSidebar.js (34 lines), frontend/investment-native/js/pages/youtube.js (334 lines), frontend/investment-native/js/sidebarUI.js (220 lines), frontend/investment-native/js/utils/chartDrawingOffcanvas.js (258 lines), frontend/investment-native/js/utils/financialCharts.js (392 lines), frontend/investment-native/js/utils/localState.js (71 lines), frontend/investment-native/js/views/assetClasses.js (193 lines), frontend/investment-native/js/views/backtest.js (72 lines), frontend/investment-native/js/views/cloudAiResources.js (97 lines), frontend/investment-native/js/views/cnnTimeseries.js (66 lines), frontend/investment-native/js/views/companyFinancial.js (118 lines), frontend/investment-native/js/views/crossValidation.js (53 lines), frontend/investment-native/js/views/dartCompanySearch.js (225 lines), frontend/investment-native/js/views/dartFinancialAnalysis.js (480 lines), frontend/investment-native/js/views/dartRegionSearch.js (271 lines), frontend/investment-native/js/views/decisionBoundary.js (26 lines), frontend/investment-native/js/views/financialKnowledge.js (350 lines), frontend/investment-native/js/views/financialStatement.js (275 lines), frontend/investment-native/js/views/globalCapitalMap.js (128 lines), frontend/investment-native/js/views/groupNetwork.js (280 lines), frontend/investment-native/js/views/home.js (762 lines), frontend/investment-native/js/views/huggingface.js (53 lines), frontend/investment-native/js/views/industryAnalysis.js (735 lines), frontend/investment-native/js/views/investmentTree.js (576 lines), frontend/investment-native/js/views/kmeans.js (52 lines), frontend/investment-native/js/views/kospiExcluded.js (304 lines), frontend/investment-native/js/views/learn.js (2538 lines), frontend/investment-native/js/views/linearRegression.js (53 lines), frontend/investment-native/js/views/llmBenchView.js (140 lines), frontend/investment-native/js/views/lstm.js (68 lines), frontend/investment-native/js/views/macroRealtime.js (161 lines), frontend/investment-native/js/views/macroSimulation.js (102 lines), frontend/investment-native/js/views/mlp.js (52 lines), frontend/investment-native/js/views/opencv.js (45 lines), frontend/investment-native/js/views/pipeline.js (76 lines), frontend/investment-native/js/views/portfolio.js (88 lines), frontend/investment-native/js/views/portfolioCombination.js (291 lines), frontend/investment-native/js/views/portfolioGuide.js (136 lines), frontend/investment-native/js/views/portfolioRegime.js (143 lines), frontend/investment-native/js/views/portfolioSimulation.js (62 lines), frontend/investment-native/js/views/quant.js (137 lines), frontend/investment-native/js/views/ragChat.js (142 lines), frontend/investment-native/js/views/randomForest.js (37 lines), frontend/investment-native/js/views/ragChat.js (142 lines)

## 범위

- QA가 TZ=UTC 환경에서 KST 시간이 정확하게 표시되는지 확인

## 참고 파일

- frontend/app.js
- frontend/auth.js
- frontend/capture.js
- frontend/chatbot.js
- frontend/days/01.html
- frontend/days/02.html
- frontend/days/03.html
- frontend/days/04.html
- frontend/days/assets/app-shell.css
- frontend/days/assets/app-shell.js
- frontend/days/assets/atlas.js
- frontend/days/assets/black-swan-events.js
- frontend/days/assets/central-bank-volatility.css
- frontend/days/assets/central-bank-volatility.js
- frontend/days/assets/data-library-reader.js
- frontend/days/assets/duration-use-case-simulators.css
- frontend/days/assets/duration-use-case-simulators.js
- frontend/days/assets/emerging-market-detail.css
- frontend/days/assets/emerging-market-modal.css
- frontend/days/assets/etf-role-detail.css
- frontend/days/assets/fund-case-market.css
- frontend/days/assets/fund-manager-add-row.css
- frontend/days/assets/glossary-drawer.js
- frontend/days/assets/glossary-modal.js
- frontend/days/assets/growth-potential-rate.js
- frontend/days/assets/lesson-understanding.js
- frontend/days/assets/site.css
- frontend/days/assets/site.js
- frontend/days/assets/visuals.js
- frontend/days/index.html
- frontend/index.html
- frontend/investment-native/index.html
- frontend/investment-native/js/api.js
- frontend/investment-native/js/app.js
- frontend/investment-native/js/auth.js
- frontend/investment-native/js/data/learnDocs.js
- frontend/investment-native/js/includeSidebar.js
- frontend/investment-native/js/pages/youtube.js
- frontend/investment-native/js/sidebarUI.js
- frontend/investment-native/js/utils/chartDrawingOffcanvas.js
- frontend/investment-native/js/utils/financialCharts.js
- frontend/investment-native/js/utils/localState.js
- frontend/investment-native/js/views/assetClasses.js
- frontend/investment-native/js/views/backtest.js
- frontend/investment-native/js/views/cloudAiResources.js
- frontend/investment-native/js/views/cnnTimeseries.js
- frontend/investment-native/js/views/companyFinancial.js
- frontend/investment-native/js/views/crossValidation.js
- frontend/investment-native/js/views/dartCompanySearch.js
- frontend/investment-native/js/views/dartFinancialAnalysis.js
- frontend/investment-native/js/views/dartRegionSearch.js
- frontend/investment-native/js/views/decisionBoundary.js
- frontend/investment-native/js/views/financialKnowledge.js
- frontend/investment-native/js/views/financialStatement.js
- frontend/investment-native/js/views/globalCapitalMap.js
- frontend/investment-native/js/views/groupNetwork.js
- frontend/investment-native/js/views/home.js
- frontend/investment-native/js/views/huggingface.js
- frontend/investment-native/js/views/industryAnalysis.js
- frontend/investment-native/js/views/investmentTree.js
- frontend/investment-native/js/views/kmeans.js
- frontend/investment-native/js/views/kospiExcluded.js
- frontend/investment-native/js/views/learn.js
- frontend/investment-native/js/views/linearRegression.js
- frontend/investment-native/js/views/llmBenchView.js
- frontend/investment-native/js/views/lstm.js
- frontend/investment-native/js/views/macroRealtime.js
- frontend/investment-native/js/views/macroSimulation.js
- frontend/investment-native/js/views/mlp.js
- frontend/investment-native/js/views/opencv.js
- frontend/investment-native/js/views/pipeline.js
- frontend/investment-native/js/views/portfolio.js
- frontend/investment-native/js/views/portfolioCombination.js
- frontend/investment-native/js/views/portfolioGuide.js
- frontend/investment-native/js/views/portfolioRegime.js
- frontend/investment-native/js/views/portfolioSimulation.js
- frontend/investment-native/js/views/quant.js
- frontend/investment-native/js/views/ragChat.js
- frontend/investment-native/js/views/randomForest.js
- frontend/investment-native/js/views/ragChat.js

## 출처

Tech Lead 에이전트 제안. 사람이 검토 후 `hermes-fleet approve <repo> <ID>`로 승인한다.
