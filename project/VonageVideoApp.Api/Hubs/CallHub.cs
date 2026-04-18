using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace VonageVideoApp.Api.Hubs
{
    public class UserConnection
    {
        public string ConnectionId { get; set; }
        public string Username { get; set; }
    }

    public class CallHub : Hub
    {
        // Static dictionary to track online users: Username -> ConnectionId
        private static readonly ConcurrentDictionary<string, string> OnlineUsers = new ConcurrentDictionary<string, string>();

        public override async Task OnConnectedAsync()
        {
            var username = Context.GetHttpContext()?.Request.Query["username"].ToString();
            if (!string.IsNullOrEmpty(username))
            {
                username = username.ToLowerInvariant().Trim(); // Normalize
                OnlineUsers[username] = Context.ConnectionId;
                await Clients.All.SendAsync("UpdateUserList", OnlineUsers.Keys.ToList());
            }
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var username = OnlineUsers.FirstOrDefault(x => x.Value == Context.ConnectionId).Key;
            if (username != null)
            {
                OnlineUsers.TryRemove(username, out _);
                await Clients.All.SendAsync("UpdateUserList", OnlineUsers.Keys.ToList());
            }
            await base.OnDisconnectedAsync(exception);
        }

        public async Task SendCall(string targetUsername, string callerUsername)
        {
            targetUsername = targetUsername.ToLowerInvariant().Trim();
            if (OnlineUsers.TryGetValue(targetUsername, out string? targetConnectionId))
            {
                await Clients.Client(targetConnectionId).SendAsync("IncomingCall", callerUsername);
            }
        }

        public async Task AnswerCall(string callerUsername, string targetUsername, bool accepted)
        {
            callerUsername = callerUsername.ToLowerInvariant().Trim();
            if (OnlineUsers.TryGetValue(callerUsername, out string? callerConnectionId))
            {
                await Clients.Client(callerConnectionId).SendAsync("CallAnswered", targetUsername, accepted);
            }
        }

        public async Task HangUp(string targetUsername, string callerUsername, string role)
        {
            targetUsername = targetUsername.ToLowerInvariant().Trim();
            if (OnlineUsers.TryGetValue(targetUsername, out string? targetConnectionId))
            {
                await Clients.Client(targetConnectionId).SendAsync("CallEnded", callerUsername, role);
            }
        }

        public async Task SendTranscriptSegment(string targetUsername, string text, string speakerName)
        {
            targetUsername = targetUsername.ToLowerInvariant().Trim();
            if (OnlineUsers.TryGetValue(targetUsername, out string? targetConnectionId))
            {
                await Clients.Client(targetConnectionId).SendAsync("ReceiveTranscriptSegment", speakerName, text);
            }
        }
    }
}
