# Agent Note: 在打包時驗證 Desktop 釋出相容性

Status: implemented

[English](2026-09-09-desktop-build-release-validation.md) | 中文

## 問題

殼與執行時描述檔案一起釋出。每次啟動比較其中的釋出資訊會重複打包檢查，卻不能證明已安裝的可執行檔案位元組與描述檔案一致。

## 決策

打包驗證器負責描述檔案 schema、shell 版本、平臺、架構、宣告的 Host 協定版本，以及 Node/pnpm semver 驗證。啟動讀取準備 profile 所需的欄位，並保留共享包記錄和 Host 入口檢查。實際 Host ready 訊息仍然驗證其協定版本。

本決策部分取代[內建執行時決策](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)中的啟動釋出相容性檢查。該記錄繼續負責包歸屬與分發的理由。

## 考慮過的替代方案

重複比較描述檔案能更早診斷混裝，但不能證明可執行檔案完整性。重新引入這些比較需要具體的安裝故障，且打包驗證和實際 Host 診斷無法充分解釋該故障。

## 後果

啟動不會僅因描述檔案宣告的釋出 schema、目標或 Host 協定不同，或 Node/pnpm 版本字串不是 semver 而拒絕執行。打包仍拒絕這些情況和 shell 版本不匹配。測試區分啟動讀取與打包驗證。
