using Vonage;
using Vonage.Video;
using Vonage.Request;
using Vonage.Video.Sessions.CreateSession;
using Vonage.Video.Authentication;
using Vonage.Video.Archives.CreateArchive;
using Vonage.Video.Archives.StopArchive;

namespace VonageVideoApp.Api.Services
{
    public interface IVideoService
    {
        Task<string> GetOrCreateSessionAsync(string roomName);
        string GenerateToken(string sessionId);
        Task<string> StartRecordingAsync(string sessionId);
        Task StopRecordingAsync(string archiveId);
    }

    public class VideoService : IVideoService
    {
        private readonly VonageClient _vonageClient;
        private readonly string _applicationId;
        private readonly ILogger<VideoService> _logger;
        private static readonly System.Collections.Concurrent.ConcurrentDictionary<string, string> _roomSessions = new();

        public VideoService(IConfiguration configuration, ILogger<VideoService> logger)
        {
            _logger = logger;
            // Rely solely on appsettings.json for consistency during debugging
            _applicationId = (configuration["Vonage:ApplicationId"] ?? "").Trim();
            if (string.IsNullOrEmpty(_applicationId)) throw new ArgumentException("Vonage:ApplicationId is missing.");
            
            var privateKeyPath = configuration["Vonage:PrivateKeyPath"]
                                 ?? throw new ArgumentException("Vonage:PrivateKeyPath is missing.");

            // If the path is relative, make it absolute relative to the app's base directory
            if (!Path.IsPathRooted(privateKeyPath))
            {
                privateKeyPath = Path.Combine(AppContext.BaseDirectory, privateKeyPath);
            }

            if (!File.Exists(privateKeyPath))
            {
                throw new FileNotFoundException($"Private key file not found at: {privateKeyPath}");
            }

            var privateKey = File.ReadAllText(privateKeyPath);
            var credentials = Credentials.FromAppIdAndPrivateKey(_applicationId, privateKey);
            _vonageClient = new VonageClient(credentials);
        }

        public async Task<string> GetOrCreateSessionAsync(string roomName)
        {
            if (string.IsNullOrWhiteSpace(roomName)) roomName = "default";
            roomName = roomName.ToLower().Trim();

            if (_roomSessions.TryGetValue(roomName, out var existingSessionId))
            {
                return existingSessionId;
            }

            var request = CreateSessionRequest.Default;
            var response = await _vonageClient.VideoClient.SessionClient.CreateSessionAsync(request);
            
            return response.Match(
                success => 
                {
                    _roomSessions.TryAdd(roomName, success.SessionId);
                    return success.SessionId;
                },
                failure => throw new Exception($"Failed to create session: {failure.GetFailureMessage()}")
            );
        }

        public string GenerateToken(string sessionId)
        {
            var claims = TokenAdditionalClaims.Parse(sessionId);
            var generator = new VideoTokenGenerator();
            
            return claims.Bind(c => generator.GenerateToken(_vonageClient.Credentials, c))
                .Match(
                    success => success.Token,
                    failure => throw new Exception($"Failed to generate token: {failure.GetFailureMessage()}")
                );
        }

        public async Task<string> StartRecordingAsync(string sessionId)
        {
            var request = CreateArchiveRequest.Build()
                .WithApplicationId(Guid.Parse(_applicationId))
                .WithSessionId(sessionId)
                .Create();
            var response = await _vonageClient.VideoClient.ArchiveClient.CreateArchiveAsync(request);

            return response.Match(
                success => success.Id.ToString(),
                failure => throw new Exception($"Failed to start recording: {failure.GetFailureMessage()}")
            );
        }

        public async Task StopRecordingAsync(string archiveId)
        {
            var request = StopArchiveRequest.Build()
                .WithApplicationId(Guid.Parse(_applicationId))
                .WithArchiveId(Guid.Parse(archiveId))
                .Create();
            var response = await _vonageClient.VideoClient.ArchiveClient.StopArchiveAsync(request);

            response.Match(
                success => true,
                failure => throw new Exception($"Failed to stop recording: {failure.GetFailureMessage()}")
            );
        }
    }
}
