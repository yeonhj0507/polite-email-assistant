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
  /* 1) JSON 형식 시도
     기대 형식:
     {
       "tone": "긍정/예의 있음",
       "suggestions": [ "문장1", "문장2", ... ]
     }
  */
  try {
    final decoded = jsonDecode(raw);
    if (decoded is Map && decoded['suggestions'] is List) {
      return (decoded['suggestions'] as List)
          .map((e) => e.toString().trim())
          .where((s) => s.isNotEmpty)
          .cast<String>()
          .toList();
    }
  } catch (_) {
    /* JSON 파싱 실패 → 넘어가서 번호 목록 패턴 처리 */
  }

  /* 2) 번호 매긴 리스트(1) …, 2) …) 백업 파싱 */
  final regex =
      RegExp(r'(?:^|\n)\s*\d+\)\s*(.+?)(?=\n\d+\)|\s*$)', dotAll: true);
  final list = regex
      .allMatches(raw)
      .map((m) => m.group(1)?.trim() ?? '')
      .where((s) => s.isNotEmpty)
      .toList();

  /* 3) 아무 패턴도 안 맞으면 raw 통째로 반환 */
  return list.isNotEmpty ? list : [raw.trim()];
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
      ? '''
        당신은 “이메일 어조 교정 비서”입니다.
        아래 문장을 분석해, 표현이 공격적·무례하거나 지나치게 직설적이라면 “수정 제안”을,
        문제가 없으면 issue: false 로 응답하세요. 다른 문장은 입력하지 마세요.
        이때 수정 제안은 어떤 방향으로 작성하는 지시가 아닌, 구체적인 문장 형태로 제시되어야 합니다.
        예시:
        입력 문장: "너무 늦게 답장해서 미안해."
        출력 예시:
        {
          "issue": true,
          "tone": "긍정/예의 있음",
          "suggestions": [
            "답장이 늦어서 죄송합니다.",
            "늦게 답장드려서 죄송합니다.",
            "답변이 늦어져서 사과드립니다."
          ]
        }

        [❗ 반드시 지킬 출력 형식 – JSON 한 줄]
        {
          "issue" : bool, // 수정이 필요하면 true, 아니면 false
          "tone": "<첫 단어>/<둘째 단어>",            // 긍정·중립·부정 / 예의 있음·중립·무례
          "suggestions": [                           // 문제 없으면 빈 배열 []
            "<제안 1>",
            "<제안 2>",
            "<제안 3>"
          ]
        }
        '''
      : 'Rewrite the following email in a more polite and professional tone. Provide three alternative versions without changing the meaning.';

  final prompt = '$instruction\n"""\n${req.body}\n"""';

  print('📝 [OpenAI] Sending prompt:\n$prompt');

  final response = await http.post(
    uri,
    headers: {
      'Content-Type': 'application/json; charset=utf-8', // ← charset 명시
      'Authorization': 'Bearer $apiKey',
    },
    body: jsonEncode({
      'model': 'gpt-3.5-turbo-1106', // ① 최신 1106
      'messages': [
        {'role': 'user', 'content': prompt}
      ],
      'max_tokens': 200,
      'temperature': 0.7,
      // ② “무조건 JSON” 강제
      'response_format': {'type': 'json_object'}
    }),
  );

  print('🛠 [OpenAI] status: ${response.statusCode}, body:\n${response.body}');

  if (response.statusCode != 200) {
    throw Exception(
        'OpenAI error: ${response.statusCode} – ${response.body.substring(0, 120)}');
  }
  final decoded =
      jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;

  final raw = decoded['choices'][0]['message']['content'] as String;
  return _splitSuggestions(raw);
}
