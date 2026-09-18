# SPDX-License-Identifier: Apache-2.0
#
# LuCI support for SFTPGo
#
include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-sftpgo
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=Qingmu <qingmu@example.com>
PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=LuCI Support for SFTPGo
LUCI_DESCRIPTION:=Manage the SFTPGo SFTP/FTP/WebDAV server and open its WebAdmin from LuCI.
LUCI_DEPENDS:=+sftpgo
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
