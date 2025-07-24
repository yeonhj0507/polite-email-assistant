import 'dart:io';
import 'package:flutter/material.dart';
import 'package:tray_manager/tray_manager.dart';
import 'package:window_manager/window_manager.dart';

import 'server.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();

  // 창을 띄우지 않고 숨김
  await windowManager.hide();

  // 트레이 세팅
  await _setupTray();

  // WebSocket 서버 시작
  startLocalServer();
}

/// ───────────────────────────────────────────────
///  Tray handler  (TrayListener mixin 구현)
/// ───────────────────────────────────────────────
class _TrayHandler with TrayListener {
  @override
  void onTrayIconMouseDown() {
    // 아이콘 클릭 시 메뉴 표시
    trayManager.popUpContextMenu();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) {
    if (menuItem.key == 'quit') {
      trayManager.destroy(); // 트레이 해제
      exit(0);               // 앱 종료
    }
  }
}

Future<void> _setupTray() async {
  // 트레이 아이콘 등록 (.ico 필요)
  await trayManager.setIcon('assets/tray_icon.ico');

  // 컨텍스트 메뉴 구성
  await trayManager.setContextMenu(Menu(items: [
    MenuItem(key: 'quit', label: 'Exit'),
  ]));

  // 위에서 만든 핸들러 인스턴스 등록
  trayManager.addListener(_TrayHandler());
}
