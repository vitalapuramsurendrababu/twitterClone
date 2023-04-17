const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());
const dbpath = path.join(__dirname, "twitterClone.db");
let db = null;
const InitializeAndStartServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running on http://localhost:3000");
    });
  } catch (e) {
    console.log(`${e.message}`);
    process.exit(1);
  }
};

InitializeAndStartServer();
//register

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const availUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(availUser);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUser = `INSERT INTO user(username,password,name,gender) VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.run(addUser);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const availabilityUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(availabilityUser);
  if (dbUser !== undefined) {
    const passwordMatch = await bcrypt.compare(password, dbUser.password);
    if (passwordMatch) {
      const jwtToken = jwt.sign(username, "MY_SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//middleware function

const AuthenticateUser = async (request, response, next) => {
  let token;
  const jwttoken = request.headers["authorization"];
  if (jwttoken !== undefined) {
    token = jwttoken.split(" ")[1];
  }
  if (token === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const tokenVerification = await jwt.verify(
      token,
      "MY_SECRET",
      (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload;
          next();
        }
      }
    );
  }
};

//Recent tweets

app.get("/user/tweets/feed/", AuthenticateUser, async (request, response) => {
  try {
    const { username } = request;
    //console.log(username);
    const userIdQuery = `SELECT user.user_id FROM user WHERE username='${username}';`;
    const userId = await db.get(userIdQuery);
    //console.log(userId);
    const feedQuery = `SELECT user.username,tweet.tweet,tweet.date_time AS dateTime FROM user INNER JOIN tweet ON user.user_id=tweet.user_id WHERE user.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id=${userId.user_id}) ORDER BY tweet.date_time DESC LIMIT 4;`;
    const dbResponse = await db.all(feedQuery);
    response.send(dbResponse);
  } catch (e) {
    console.log(`${e.message}`);
  }
});

//user following
app.get("/user/following/", AuthenticateUser, async (request, response) => {
  try {
    const { username } = request;
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userId = await db.get(userIdQuery);
    //console.log(userId);

    const followingQuery = `SELECT DISTINCT user.name FROM user INNER JOIN follower ON user.user_id=follower.following_user_id WHERE follower.follower_user_id=${userId.user_id};`;
    const Response = await db.all(followingQuery);
    response.send(Response);
  } catch (e) {
    console.log(`${e.message}`);
  }
});

//user followers

app.get("/user/followers/", AuthenticateUser, async (request, response) => {
  try {
    const { username } = request;
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userId = await db.get(userIdQuery);
    //console.log(userId);
    const followingQuery = `SELECT DISTINCT user.name FROM user WHERE user_id IN (SELECT follower_user_id FROM follower WHERE following_user_id=${userId.user_id});`;
    const Response = await db.all(followingQuery);
    response.send(Response);
  } catch (e) {
    console.log(`${e.message}`);
  }
});

//checking following user or not

const check = async (request, response, next) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const userId = await db.get(userIdQuery);
  const tweetIdUser = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetUser = await db.get(tweetIdUser);
  //console.log(tweetUser);
  const followersQuery = `SELECT following_user_id AS user_id FROM follower WHERE follower_user_id=${userId.user_id};`;
  const followersObject = await db.all(followersQuery);
  const followersArray = [];
  for (let each of followersObject) {
    followersArray.push(each.user_id);
  }
  //console.log(followersArray);
  const isContain = followersArray.includes(tweetUser.user_id);
  if (isContain) {
    next();
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
};

//tweets user
app.get(
  "/tweets/:tweetId/",
  AuthenticateUser,
  check,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userId = await db.get(userIdQuery);
    const likesQuery = `SELECT COUNT(like_id)AS likes FROM like WHERE tweet_id=${tweetId};`;
    const likes = await db.get(likesQuery);
    //console.log(likes);
    const repliesQuery = `SELECT COUNT(reply)AS replies FROM reply WHERE tweet_id=${tweetId};`;
    const replies = await db.get(repliesQuery);
    //console.log(replies);
    const tweetQuery = `SELECT tweet,date_time FROM tweet WHERE tweet_id=${tweetId};`;
    const tweet = await db.get(tweetQuery);
    //console.log(tweet);
    response.send({
      tweet: tweet.tweet,
      likes: likes.likes,
      replies: replies.replies,
      dateTime: tweet.date_time,
    });
  }
);

//specific tweet_id likes

app.get(
  "/tweets/:tweetId/likes/",
  AuthenticateUser,
  check,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userId = await db.get(userIdQuery);
    const likesQuery = `SELECT username FROM user INNER JOIN like ON user.user_id=like.user_id WHERE like.tweet_id=${tweetId};`;
    const likesnames = await db.all(likesQuery);
    const likeArray = [];
    for (let each of likesnames) {
      likeArray.push(each.username);
    }
    response.send({ likes: likeArray });
  }
);

//specific tweet replies

app.get(
  "/tweets/:tweetId/replies/",
  AuthenticateUser,
  check,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userId = await db.get(userIdQuery);
    const replyQuery = `SELECT name,reply FROM user INNER JOIN reply ON user.user_id=reply.user_id WHERE tweet_id=${tweetId};`;
    const replies = await db.all(replyQuery);
    const replyArray = [];
    for (let each of replies) {
      replyArray.push(each);
    }
    response.send({ replies: replyArray });
  }
);

//user tweets

app.get("/user/tweets/", AuthenticateUser, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const userId = await db.get(userIdQuery);
  const tweetsQuery = `SELECT tweet.tweet AS tweet,COUNT(like_id)AS likes,COUNT(reply)AS replies,tweet.date_time AS dateTime FROM (tweet INNER JOIN like ON like.tweet_id=tweet.tweet_id)AS t1 INNER JOIN reply ON reply.tweet_id=t1.tweet_id WHERE tweet.user_id=${userId.user_id} GROUP BY tweet.tweet_id;`;
  const tweets = await db.all(tweetsQuery);
  response.send(tweets);
});

//post tweet

const posttweet = app.post(
  "/user/tweets/",
  AuthenticateUser,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const { tweet } = request.body;
    const dateTime = new Date();
    //console.log(dateTime);
    const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
    const userId = await db.get(userIdQuery);
    const insertQuery = `INSERT INTO tweet(tweet,user_id) VALUES ('${tweet}',${userId.user_id});`;
    await db.run(insertQuery);
    response.send("Created a Tweet");
  }
);

//delete a tweet
app.delete("/tweets/:tweetId/", AuthenticateUser, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const userId = await db.get(userIdQuery);
  const tweetUser = `SELECT user_id FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetuser = await db.get(tweetUser);
  if (userId.user_id === tweetuser.user_id) {
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
    await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = posttweet;
