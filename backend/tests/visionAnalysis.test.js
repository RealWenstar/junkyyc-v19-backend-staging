const {
  analyzeImagesWithOpenAI,
  buildAnalyzeResponse,
  buildVisionRequest,
  isExplicitDemoMode
} = require('../src/services/visionAnalysis');

describe('vision analysis OpenAI contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('builds a deterministic JSON-mode OpenAI vision request with catalog_key instructions', () => {
    const request = buildVisionRequest('abc123', 0);

    expect(request.temperature).toBe(0);
    expect(request.response_format).toEqual({ type: 'json_object' });
    expect(request.max_tokens).toBeGreaterThanOrEqual(600);
    expect(request.messages[0].content).toContain('catalog_key');
    expect(request.messages[0].content).toContain('sofa');
    expect(request.messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,abc123');
  });

  test('returns recognition_ms from the real OpenAI call window', async () => {
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1425);

    const create = jest.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            items: [{
              name: 'Sectional couch',
              catalog_key: 'couch',
              quantity: 1,
              size: 'large',
              confidence: 0.94,
              category: 'furniture'
            }],
            total_items: 1,
            analysis_quality: 'high'
          })
        }
      }]
    });

    const result = await analyzeImagesWithOpenAI(
      { chat: { completions: { create } } },
      ['image-1']
    );

    expect(result.recognition_ms).toBe(425);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.analyses[0].items[0]).toMatchObject({
      catalog_key: 'couch',
      category: 'furniture'
    });
  });

  test('does not substitute demo items when OpenAI rejects the request', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Date, 'now')
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(2075);

    const create = jest.fn().mockRejectedValue({ status: 401, code: 'invalid_api_key' });

    const result = await analyzeImagesWithOpenAI(
      { chat: { completions: { create } } },
      ['image-1']
    );

    expect(result.recognition_ms).toBe(75);
    expect(result.analyses[0]).toEqual({
      items: [],
      total_items: 0,
      error: 'AI service unavailable'
    });
    expect(JSON.stringify(result)).not.toMatch(/Sofa|Chair|Cardboard boxes/i);
  });
});

describe('analyze response contract', () => {
  test('returns an honest empty result with recognition_ms instead of demo fallback', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const payload = buildAnalyzeResponse({
      analyses: [{ items: [], total_items: 0, error: 'No items detected' }],
      recognition_ms: 310,
      leadId: 'lead-empty'
    });

    expect(payload).toMatchObject({
      lead_id: 'lead-empty',
      items: [],
      total_volume: 0,
      pricing: null,
      analysis_complete: true,
      recognition_ms: 310
    });
    expect(JSON.stringify(payload)).not.toMatch(/Sofa|Chair|Cardboard boxes/i);
  });

  test('requires both env flag and request flag for demo mode', () => {
    expect(isExplicitDemoMode({ ENABLE_DEMO_MODE: 'true' }, { demo: '1' })).toBe(true);
    expect(isExplicitDemoMode({ ENABLE_DEMO_MODE: 'true' }, {})).toBe(false);
    expect(isExplicitDemoMode({}, { demo: '1' })).toBe(false);
  });
});
