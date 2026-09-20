# SPDX-License-Identifier: GPL-2.0-only
#
# OpenWrt package for SFTPGo (https://github.com/drakkan/sftpgo)
#
include $(TOPDIR)/rules.mk

PKG_NAME:=sftpgo
PKG_VERSION:=2.7.6
PKG_RELEASE:=1

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/drakkan/sftpgo/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=skip

PKG_LICENSE:=AGPL-3.0-only
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=Qingmu <qingmu@example.com>

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/drakkan/sftpgo/v2
GO_PKG_BUILD_PKG:=github.com/drakkan/sftpgo/v2

# --- Build tags -------------------------------------------------------------
# 目标载体是 x86 OpenWrt（正常 glibc/musl + gcc 工具链、真实硬盘/SSD/eMMC
# 存储），因此保留 SFTPGo 的完整 sqlite/bolt 等原生 provider。数据库、监听器、
# TLS、OIDC、MFA、ACME、Plugins 等设置全部由原生 sftpgo.json 管理，不再复制到 UCI。
# nopgxregisterdefaulttypes / disable_grpc_modules 是上游发布流程自己也会
# 加的裁剪选项，与 sqlite/CGO 无关，继续保留。多个 tag 之间用逗号分隔
# （与 golang-package.mk 给出的用法示例 GO_PKG_TAGS:=release,noupgrade 一致）。
GO_PKG_TAGS:=nopgxregisterdefaulttypes,disable_grpc_modules

# version.version / version.commit 在 internal/version/version.go 里分别是
# 不可导出的 const 和空字符串 var；const 无法用 -X 覆盖，commit 留空对应
# "非官方发布渠道构建"的正常状态（不要瞎填一个假 commit）。只覆盖有意义、
# 确实可被 -X 覆盖的 date 字段，且使用 OpenWrt 的 SOURCE_DATE_EPOCH 以保证
# 可复现构建。
GO_PKG_LDFLAGS_X:= \
	github.com/drakkan/sftpgo/v2/internal/version.date=$(shell date -u -d @$(SOURCE_DATE_EPOCH) +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u +%Y-%m-%dT%H:%M:%SZ)

# 不再额外加 -s -w：OpenWrt 默认已经会 strip 产出的二进制（见
# golang-package.mk 里的说明），重复指定没有意义。

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/sftpgo
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=File Transfer
  TITLE:=Fully featured SFTP/FTP/WebDAV server with Web UI
  URL:=https://github.com/drakkan/sftpgo
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle
  USERID:=sftpgo:sftpgo
endef

define Package/sftpgo/description
  SFTPGo is a fully featured, highly configurable managed file transfer
  (MFT) solution. It exposes the same accounts/permissions over SFTP,
  SCP, FTP/S, WebDAV and a built-in HTTPS WebClient/WebAdmin, with
  pluggable local/S3/GCS/Azure Blob storage backends.
  This package ships the sftpgo binary built for x86 OpenWrt. The native
  upstream sftpgo.json is installed read-only as
  /usr/share/sftpgo/sftpgo.default.json; the live, user-editable
  /etc/sftpgo/sftpgo.json is created from it on first start by the
  init script and is never touched by opkg afterwards. Also ships
  WebAdmin/WebClient templates+static+openapi assets and a procd init
  script; use luci-app-sftpgo for the LuCI management UI.
endef

define Package/sftpgo/conffiles
/etc/config/sftpgo
endef

# 注意：templates(~1.1MB) + static(~8.6MB) + openapi(~2.2MB) 合计约 12MB，
# 是内置 WebAdmin/WebClient 前端资源，无法再裁剪而不损失功能。flash 紧张
# 的设备请评估是否真的需要内置 Web 管理界面，或者自行精简 static 目录后
# 通过 GO_PKG_INSTALL_EXTRA / 自定义 install 规则单独打一个瘦身版。
define Package/sftpgo/install
	$(call GoPackage/Package/Install/Bin,$(1))

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/sftpgo.init $(1)/etc/init.d/sftpgo
	$(INSTALL_CONF) ./files/sftpgo.config $(1)/etc/config/sftpgo
	$(INSTALL_BIN) ./files/sftpgo.uci-defaults $(1)/etc/uci-defaults/99-sftpgo

	# 注意：这里故意不安装 /etc/sftpgo/sftpgo.json。真正的运行配置完全由
	# sftpgo.init 的 ensure_native_config() 在首次启动时从下面的
	# sftpgo.default.json 复制生成，opkg 升级这个包永远不会碰它——不存在
	# conffile 合并/覆盖的不确定性。
	$(INSTALL_DIR) $(1)/usr/share/sftpgo
	$(CP) $(PKG_BUILD_DIR)/templates $(1)/usr/share/sftpgo/
	$(CP) $(PKG_BUILD_DIR)/static $(1)/usr/share/sftpgo/
	$(CP) $(PKG_BUILD_DIR)/openapi $(1)/usr/share/sftpgo/
	$(INSTALL_CONF) $(PKG_BUILD_DIR)/sftpgo.json $(1)/usr/share/sftpgo/sftpgo.default.json
endef

$(eval $(call GoBinPackage,sftpgo))
$(eval $(call BuildPackage,sftpgo))
