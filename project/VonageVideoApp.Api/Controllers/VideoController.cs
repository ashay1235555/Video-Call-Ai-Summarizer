using Microsoft.AspNetCore.Mvc;
using VonageVideoApp.Api.Services;

namespace VonageVideoApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class VideoController : ControllerBase
    {
        private readonly IVideoService _videoService;
        private readonly string _applicationId;

        public VideoController(IVideoService videoService, IConfiguration configuration)
        {
            _videoService = videoService;
            _applicationId = configuration["Vonage:ApplicationId"] 
                             ?? throw new ArgumentException("Vonage:ApplicationId is missing in configuration.");
        }

        [HttpPost("session")]
        public async Task<IActionResult> CreateSession([FromBody] SessionRequest? request)
        {
            try
            {
                var roomName = request?.RoomName ?? "default";
                var sessionId = await _videoService.GetOrCreateSessionAsync(roomName);
                var token = _videoService.GenerateToken(sessionId);

                return Ok(new
                {
                    ApplicationId = _applicationId,
                    SessionId = sessionId,
                    Token = token
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = ex.Message, Detail = ex.ToString() });
            }
        }

        [HttpPost("start-recording")]
        public async Task<IActionResult> StartRecording([FromBody] RecordingRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.SessionId)) return BadRequest("SessionId is required.");
                var archiveId = await _videoService.StartRecordingAsync(request.SessionId);
                return Ok(new { ArchiveId = archiveId });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = ex.Message });
            }
        }

        [HttpPost("stop-recording")]
        public async Task<IActionResult> StopRecording([FromBody] StopRecordingRequest request)
        {
            try
            {
                if (string.IsNullOrEmpty(request.ArchiveId)) return BadRequest("ArchiveId is required.");
                await _videoService.StopRecordingAsync(request.ArchiveId);
                return Ok(new { Message = "Recording stopped successfully" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { Message = ex.Message });
            }
        }

        public class SessionRequest
        {
            public string? RoomName { get; set; }
        }

        public class RecordingRequest
        {
            public string? SessionId { get; set; }
        }

        public class StopRecordingRequest
        {
            public string? ArchiveId { get; set; }
        }
    }
}
