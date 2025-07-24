// lib/server.dart

import 'dart:convert';
import 'dart:io';

import 'api_service.dart';

const int _port = 37100;

void startLocalServer() async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, _port);
  print('📡 WebSocket listening on ws://127.0.0.1:$_port');

  await for (var req in server) {
    if (!WebSocketTransformer.isUpgradeRequest(req)) {
      req.response
        ..statusCode = HttpStatus.badRequest
        ..close();
      continue;
    }

    final socket = await WebSocketTransformer.upgrade(req);
    print('✅ Extension connected');

    socket.listen((data) async {
      try {
        // 1) 받은 raw JSON 찍기
        print('▶ Raw from extension: $data');

        // 2) ping 걸러내기
        final Map<String, dynamic> msg = jsonDecode(data as String);
        if (msg['type'] == 'ping') {
          socket.add(jsonEncode({'type': 'pong'}));
          return;
        }

        // 3) EmailRequest 로 파싱
        final req = EmailRequest.fromJson(msg);
        print('▶ Parsed EmailRequest: to=${req.to}, subject="${req.subject}"');

        // 4) generatePoliteRewrites 호출 (api_service.dart 로깅 포함)
        final suggestions = await generatePoliteRewrites(req);

        // 5) 결과 전송
        final out = jsonEncode({'suggestions': suggestions});
        print('◀ Sending suggestions: $out');
        socket.add(out);
      } catch (e) {
        print('❌ Error in server.listen: $e');
        socket.add(jsonEncode({'error': e.toString()}));
      }
    }, onDone: () => print('🔌 Extension disconnected'));
  }
}
