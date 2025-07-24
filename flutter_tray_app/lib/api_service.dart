import 'dart:convert';
import 'package:http/http.dart' as http;

/// ===============================================
///  EmailRequest  ────────────────────────────────
/// ===============================================
class EmailRequest {
  final List<String> to;
  final String subject;
  final String body;
  EmailRequest({required this.to, required this.subject, required this.body});

  factory EmailRequest.fromJson(Map<String, dynamic> json) {
    return EmailRequest(
      to: List<String>.from(json['to'] ?? []),
      subject: json['subject'] ?? '',
      body: json['body'] ?? '',
    );
  }
}

/// ===============================================
///  Language detection  ──────────────────────────
/// ===============================================
String _detectLanguage(String text) =>
    RegExp(r'[\uac00-\ud7af]').hasMatch(text) ? 'ko' : 'en';

/// ===============================================
///  Split GPT response into list  ────────────────
/// ===============================================
List<String> _splitSuggestions(String raw) {
  final regex =
      RegExp(r'(?:^|\n)\d+\.\s*(.+?)(?=(?:\n\d+\.|\s*$))', dotAll: true);
  final matches = regex.allMatches(raw).map((m) => m.group(1)!.trim()).toList();
  // fallback: if regex 실패 시 전체를 단일 제안으로
  return matches.isNotEmpty ? matches : [raw.trim()];
}

/// ===============================================
///  OpenAI call  ────────────────────────────────
/// ===============================================
Future<List<String>> generatePoliteRewrites(EmailRequest req) async {
  const apiKey = String.fromEnvironment('OPENAI_API_KEY',
      defaultValue: 'YOUR_OPENAI_API_KEY'); // 빌드 시 --dart-define 사용 가능
  final uri = Uri.parse('https://api.openai.com/v1/chat/completions');

  final lang = _detectLanguage(req.body);
  final instruction = (lang == 'ko')
      ? '다음 이메일을 더 공손하고 정중한 말투로 3가지 버전으로 다시 작성해줘. 의미는 바꾸지 말아줘.'
      : 'Rewrite the following email in a more polite and professional tone. Provide three alternative versions without changing the meaning.';

  final prompt = '$instruction\n"""\n${req.body}\n"""';

  print('📝 [OpenAI] Sending prompt:\n$prompt');

  final response = await http.post(
    uri,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $apiKey',
    },
    body: jsonEncode({
      'model': 'gpt-3.5-turbo',
      'messages': [
        {'role': 'user', 'content': prompt}
      ],
      'max_tokens': 200,
      'temperature': 0.7,
    }),
  );

  print('🛠 [OpenAI] status: ${response.statusCode}, body:\n${response.body}');
  
  if (response.statusCode != 200) {
    throw Exception(
        'OpenAI error: ${response.statusCode} – ${response.body.substring(0, 120)}');
  }

  final raw = jsonDecode(response.body)['choices'][0]['message']['content'];
  return _splitSuggestions(raw);
}
