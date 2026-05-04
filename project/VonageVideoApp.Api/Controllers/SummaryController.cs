using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Text.Json;
using System.Net.Http;

namespace VonageVideoApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SummaryController : ControllerBase
    {
        private readonly IConfiguration _configuration;
        private readonly IHttpClientFactory _httpClientFactory;

        public SummaryController(IConfiguration configuration, IHttpClientFactory httpClientFactory)
        {
            _configuration = configuration;
            _httpClientFactory = httpClientFactory;
        }

        [HttpPost("generate")]
        public async Task<IActionResult> GenerateSummary([FromBody] SummaryRequest request)
        {
            var apiKey = _configuration["AI:GeminiApiKey"];
            var modelId = _configuration["AI:ModelId"] ?? "gemini-1.5-flash";

            if (string.IsNullOrEmpty(apiKey))
            {
                return BadRequest("Gemini API Key is not configured correctly in 'AI:GeminiApiKey'.");
            }

            var client = _httpClientFactory.CreateClient();
            var url = $"https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent?key={apiKey}";

            var systemPrompt = @"You are a medical assistant analyzing a doctor-patient conversation transcript.
The transcript includes speaker names and their roles (Provider or Patient).

INSTRUCTIONS:
Step 1: Clean the transcript (Remove greetings, filler words, technical issues).
Step 2: Extract medical data. Use the roles to guide your logic:
        - Trust information from the 'Provider' for Diagnosis, Medications, Advice, and Follow-up.
        - Trust information from the 'Patient' for Symptoms and Duration.
Step 3: If information is contradictory, prioritize the 'Provider's' final conclusion.
Step 4: Be strict and accurate. If missing, use 'Not specified'.

OUTPUT FORMAT (STRICT JSON ONLY):
{
  ""symptoms"": [],
  ""duration"": """",
  ""diagnosis"": """",
  ""medications"": [],
  ""advice"": [],
  ""follow_up"": """"
}";

            var body = new
            {
                contents = new[]
                {
                    new {
                        role = "user",
                        parts = new[] {
                            new { text = $"{systemPrompt}\n\nTRANSCRIPT:\n{request.FullTranscript}" }
                        }
                    }
                },
                generationConfig = new {
                    responseMimeType = "application/json"
                }
            };

            var jsonBody = JsonSerializer.Serialize(body);
            var content = new StringContent(jsonBody, Encoding.UTF8, "application/json");

            try
            {
                var response = await client.PostAsync(url, content);
                var responseString = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    return StatusCode((int)response.StatusCode, responseString);
                }

                // Parse the Gemini response to get the inner JSON content
                using var doc = JsonDocument.Parse(responseString);
                var generatedText = doc.RootElement
                    .GetProperty("candidates")[0]
                    .GetProperty("content")
                    .GetProperty("parts")[0]
                    .GetProperty("text")
                    .GetString();

                return Content(generatedText, "application/json"); // Return raw JSON directly
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }

    public class SummaryRequest
    {
        public string FullTranscript { get; set; } = string.Empty;
    }
}
