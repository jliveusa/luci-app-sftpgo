# SPDX-License-Identifier: GPL-2.0-only
#
# OpenWrt package for SFTPGo (https://github.com/drakkan/sftpgo)
#
include $(TOPDIR)/rules.mk

PKG_NAME:=sftpgo
PKG_VERSION:=2.7.5
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
# nopgxregisterdefaulttypes / disable_grpc_modules: 上游 CI 默认使用的裁剪选项。
# nosqlite: 去掉 mattn/go-sqlite3（唯一的 CGO 依赖），使整个二进制可以
#           CGO_ENABLED=0 交叉编译，避免在各种 OpenWrt target/libc(musl)
#           工具链上处理 CGO 交叉链接的问题。数据落地改用纯 Go 的 bolt
#           驱动（单文件 KV，等效于嵌入式路由场景下的 sqlite）。
#           如确需 sqlite 驱动，去掉 nosqlite 标签并确认 target 工具链
#           CGO 交叉编译可用（芯片架构 + libc 均需支持），且构建时间会显著增加。
GO_PKG_TAGS:=disable_grpc_modules

GO_PKG_LDFLAGS_X:= \
   github.com/drakkan/sftpgo/v2/internal/version.commit=openwrt \
   github.com/drakkan/sftpgo/v2/internal/version.date=$(PKG_BUILD_DATE)
GO_PKG_LDFLAGS:=-s -w

# 显式禁用 CGO：与上面的 nosqlite 标签配套，保证交叉编译不依赖 target libc 头文件。
CGO_ENABLED:=1

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
  This package ships the sftpgo binary (bolt data provider, CGO
  disabled) plus a procd init script; use luci-app-sftpgo for the
  LuCI management UI.
endef

define Package/sftpgo/conffiles
/etc/config/sftpgo
endef

define Package/sftpgo/install
	$(call GoPackage/Package/Install/Bin,$(1))

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_DIR) $(1)/etc/sftpgo
	$(INSTALL_BIN) ./files/sftpgo.init $(1)/etc/init.d/sftpgo
	$(INSTALL_CONF) ./files/sftpgo.config $(1)/etc/config/sftpgo
	$(INSTALL_BIN) ./files/sftpgo.uci-defaults $(1)/etc/uci-defaults/99-sftpgo
endef

$(eval $(call GoBinPackage,sftpgo))
$(eval $(call BuildPackage,sftpgo))
