import 'dart:convert';
import 'package:http/http.dart' as http;

/// ===============================================
///  EmailRequest  ────────────────────────────────
/// ===============================================
class EmailRequest {
  final List<String> to;        // 받는 사람 주소 배열
  final String subject;         // 제목
  final String body;            // 전체 본문(백업용)
  final String focus;           // 방금 끝난 한 문장 (= Target)

  EmailRequest({
    required this.to,
    required this.subject,
    required this.body,
    this.focus = '',
  });

  factory EmailRequest.fromJson(Map<String, dynamic> json) => EmailRequest(
        to: List<String>.from(json['to'] ?? []),
        subject: json['subject'] ?? '',
        body: json['body'] ?? '',
        focus: json['focus'] ?? '',
      );
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
  try {
    final decoded = jsonDecode(raw);
    if (decoded is Map && decoded['suggestions'] is List) {
      return (decoded['suggestions'] as List)
          .map((e) => e.toString().trim())
          .where((s) => s.isNotEmpty)
          .cast<String>()
          .toList();
    }
  } catch (_) {/* pass */}

  final regex =
      RegExp(r'(?:^|\n)\s*\d+\)\s*(.+?)(?=\n\d+\)|\s*$)', dotAll: true);
  final list = regex
      .allMatches(raw)
      .map((m) => m.group(1)?.trim() ?? '')
      .where((s) => s.isNotEmpty)
      .toList();

  return list.isNotEmpty ? list : [raw.trim()];
}

/// ===============================================
///  OpenAI call  ────────────────────────────────
/// ===============================================
Future<List<String>> generatePoliteRewrites(EmailRequest req) async {
  const apiKey = String.fromEnvironment(
    'OPENAI_API_KEY',
    defaultValue: 'YOUR_OPENAI_API_KEY',
  );
  final uri = Uri.parse('https://api.openai.com/v1/chat/completions');

  // ── 언어 판별 (focus 우선) ─────────────────────
  final lang = _detectLanguage(req.focus.isNotEmpty ? req.focus : req.body);

  // ── 시스템 프롬프트 ───────────────────────────
  const systemKo = '''
당신은 “이메일 어조 교정 비서”입니다.

입력
- Target: 방금 작성이 끝난 **하나의 문장** (유일한 교정 대상)

🎯 작업
Target 문장을 **동일한 의미로** 유지하면서 공손·전문적인 어조로 *재작성*한
대안 3개를 완성형 문장으로 제시하십시오.

규칙
1. Target의 의미(질문·요청·사실)를 유지하고 단어·정보를 추가·삭제하지 마세요.
2. "issue": true 또는 false 로 수정 필요 여부를 표시합니다.
3. 문제가 없으면 suggestions 는 빈 배열 [] 이어야 합니다.
4. 각 제안은 원본 길이 ±30자 이내, 문장 부호로 끝나는 완전한 문장이어야 합니다.
5. **‘더 공손하게 말씀해 주세요’** 같은 **지시·설명형 문장을 금지**합니다.
6. 출력은 반드시 *한 줄 JSON*:

예시  
Target: "너는 이름이 뭐냐?"  
✅ 올바른 출력 예
{"issue": true, "tone": "중립/무례", "suggestions": ["성함이 어떻게 되시나요?", "이름을 여쭤봐도 될까요?", "성함을 알려주실 수 있을까요?"]}

❌ 잘못된 예
{"issue": true, "tone": "중립/무례", "suggestions": ["죄송하지만, 이름을 물어보실 때는 공손한 표현을…"]}   ← *지시문 금지*
''';

  const systemEn = '''
You are an "Email Politeness Assistant".

Input
- Target: the single sentence just completed (ONLY sentence to rewrite)

🎯 Task
Rewrite the Target sentence into **three polite alternatives** that keep its
exact meaning. Provide *complete sentences* only.

Rules
1. Preserve the intent (question / request / statement); do NOT add or remove information.
2. Set "issue": true if rewriting is needed; otherwise false and suggestions = [].
3. Each suggestion must end with proper punctuation and stay within ±30 characters of the original length.
4. Do **NOT** output instructions such as "Please ask politely"; only the rewritten sentences.
5. Return **one-line JSON**.

Example  
Target: "What's your name?"  
Good:
{"issue": true, "tone": "Neutral/Rude", "suggestions": ["May I ask your name?", "Could you tell me your name, please?", "May I know your name?"]}

Bad (instruction):
{"issue": true, "tone": "Neutral/Rude", "suggestions": ["You should ask for the name more politely."]}
''';

// ── Target 문장 결정 ──────────────────────────
String _pickLastSentence(String text) {
  final parts = text
      .trim()
      .split(RegExp(r'(?<=[.!?؟¡。？！])\s+'))
      .where((s) => s.trim().isNotEmpty)
      .toList();
  return parts.isEmpty ? text.trim() : parts.last.trim();
}

final String tgt = req.focus.isNotEmpty        // ① focus 있으면 그대로
    ? req.focus.trim()
    : _pickLastSentence(req.body);             // ② 없으면 body 마지막 문장만

final userPrompt = '''
Target:
"""
$tgt
"""
''';


  // ── API 호출 ─────────────────────────────────
  final response = await http.post(
    uri,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': 'Bearer $apiKey',
    },
    body: jsonEncode({
      'model': 'gpt-3.5-turbo-1106',
      'messages': [
        {'role': 'system', 'content': lang == 'ko' ? systemKo : systemEn},
        {'role': 'user', 'content': userPrompt},
      ],
      'max_tokens': 1500,
      'temperature': 0.3,
      'response_format': {'type': 'json_object'},
    }),
  );

  if (response.statusCode != 200) {
    throw Exception('OpenAI error ${response.statusCode}: '
        '${response.body.substring(0, 120)}');
  }

  // ── 응답 파싱 ─────────────────────────────────
  final content =
      (jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>)
              ['choices'][0]['message']['content']
          .toString();

  // issue=false + 빈 배열이면 빈 리스트 반환
  try {
    final js = jsonDecode(content);
    if (js is Map &&
        js['issue'] == false &&
        js['suggestions'] is List &&
        (js['suggestions'] as List).isEmpty) {
      return [];
    }
  } catch (_) {/* content가 JSON이 아닐 때는 계속 진행 */}

  return _splitSuggestions(content);
}