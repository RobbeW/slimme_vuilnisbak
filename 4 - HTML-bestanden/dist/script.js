// My educated guess as to what the iPhone X will look like
const select = s => document.querySelector(s);

const displayDate = select('.lock-date');
const displayTime = select('.lock-time');

function updateTime() {
  const date = new Date();

  const hour = date.getHours() < 13 ?
  date.getHours() === 0 ?
  12 :
  date.getHours() :
  date.getHours() - 12;

  const minutes = date.getMinutes() < 10 ?
  `0${date.getMinutes()}` :
  date.getMinutes();

  const formattedDate = date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric' });


  displayTime.innerText = `${hour}:${minutes}`;
  displayDate.innerText = formattedDate;

  requestAnimationFrame(updateTime);
}

updateTime();